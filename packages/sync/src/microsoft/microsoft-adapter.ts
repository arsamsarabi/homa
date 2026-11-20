// Microsoft Graph v1.0 (Outlook.com and Microsoft 365 calendars, plain REST) with OAuth tokens.
//
// Calendars: GET /me/calendars; `canEdit: false` is read-only in Homa, `hexColor` the color.
// Pull: Graph v1.0 has calendarView/delta only for the primary calendar (per-calendar delta is beta),
// so every pull lists the calendar's events (`/me/calendars/{id}/events`: single events and series
// masters, paged with @odata.nextLink) with Homa's UID property expanded, and compares each one's
// changeKey with the one Homa holds: only changed events are read, and what Homa holds that isn't
// listed is gone. A changed series master is fetched again with its exceptions and cancelled
// occurrences. One resource per series; its href is the master's URL and its ETag the master's changeKey.
// Push: Graph documents no If-Match for events, so a change first reads the event's changeKey and
// a mismatch is a PushConflict (the caller lets the remote win). A new event is created with a
// transactionId from its UID (a retried create returns the same event) and Homa's UID in a private
// extended property; Graph picks its id, so the push returns the href. Overrides patch their
// occurrence, EXDATEs delete theirs.
// Tokens: refreshed a minute before they expire, or once after a 401; Microsoft rotates the refresh
// token, so every new pair goes to `onCredentials` to be stored. 429 and 503 honor Retry-After.
import { parseIcs } from '@homa/core';
import type { ChangeOp, PullResult, RemoteCalendar, RemoteResource, SyncAdapter, SyncCursor } from '../adapter';
import {
  CalendarGoneError,
  DEFAULT_FETCH_POLICY,
  type FetchPolicy,
  PushConflict,
  PushError,
  readCapped,
  SyncError,
} from '../feed';
import {
  type GraphEvent,
  graphBody,
  HOMA_UID_PROPERTY,
  occurrenceBody,
  readSeries,
  transactionIdOf,
  UnsupportedRecurrence,
} from './mapping';
import {
  type MicrosoftClient,
  type MicrosoftCredentials,
  microsoftEndpointsOf,
  RECONNECT_MICROSOFT,
  refreshMicrosoftToken,
} from './oauth';

export type MicrosoftAdapterOptions = {
  /** IANA zone for times without a zone Homa knows: the owner's home zone. */
  floatingTz: string;
  client: MicrosoftClient;
  /** Stores refreshed (and rotated) tokens. */
  onCredentials?: (credentials: MicrosoftCredentials) => Promise<void>;
  policy?: FetchPolicy;
  now?: () => number;
};

type Answer = { status: number; body: Record<string, unknown> | null; retryAfterMs?: number };

/** Events per page, and most pages per listing (so at most 50,000 events). */
const PAGE_SIZE = '100';
const MAX_PAGES = 500;
/** Refresh this long before the access token expires. */
const EARLY_MS = 60_000;
const MINUTE = 60_000;
/** Times in UTC (the mapping places them in the event's own zone), bodies as text. */
const PREFER = 'outlook.timezone="UTC", outlook.body-content-type="text"';
const FIELDS = [
  'id',
  'changeKey',
  'type',
  'subject',
  'body',
  'location',
  'start',
  'end',
  'isAllDay',
  'isCancelled',
  'originalStartTimeZone',
  'iCalUId',
  'recurrence',
].join(',');
const UID_EXPAND = `singleValueExtendedProperties($filter=id eq '${HOMA_UID_PROPERTY}')`;

const throttled = (a: Answer): boolean => a.status === 429 || a.status === 503;

const failed = (a: Answer): SyncError =>
  throttled(a)
    ? new SyncError('Microsoft is limiting requests from Homa for now; the next sync tries again')
    : new SyncError(`Microsoft Graph answered ${a.status}`);

/** Graph's own explanation, if it gave one (never carries tokens). */
const graphMessage = (a: Answer): string => {
  const message = (a.body?.error as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && message ? `: ${message.slice(0, 200)}` : '';
};

const pushFailed = (a: Answer): PushError =>
  new PushError(
    `Outlook refused the change (${a.status})${graphMessage(a)}`,
    a.status >= 500 || a.status === 408 || a.status === 429,
    a.retryAfterMs,
  );

/** Retry-After in seconds or as an HTTP date, capped at an hour. */
function retryAfterOf(res: Response, now: number): number | undefined {
  const v = res.headers.get('retry-after');
  if (!v) return undefined;
  const ms = /^\d+$/.test(v) ? Number(v) * 1000 : Date.parse(v) - now;
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 60 * MINUTE) : undefined;
}

const ok = (a: Answer): boolean => a.status >= 200 && a.status < 300;
const changeKeyOf = (a: Answer): string | null => (typeof a.body?.changeKey === 'string' ? a.body.changeKey : null);

/**
 * @example
 * const adapter = microsoftAdapter(credentials, { floatingTz, client, onCredentials: save });
 * const calendars = await adapter.listCalendars();
 */
export function microsoftAdapter(credentials: MicrosoftCredentials, options: MicrosoftAdapterOptions): SyncAdapter {
  const policy = options.policy ?? DEFAULT_FETCH_POLICY;
  const now = options.now ?? Date.now;
  const api = microsoftEndpointsOf(options.client).api;
  let tokens = credentials;

  const eventsUrl = (calendarId: string): string => `${api}/me/calendars/${encodeURIComponent(calendarId)}/events`;
  const hrefOf = (calendarId: string, eventId: string): string =>
    `${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`;
  /** The calendar and event ids in an href this adapter made; `new-…` is a create's placeholder. */
  const parseHref = (href: string): { calendarId: string; eventId: string } => {
    const m = /\/me\/calendars\/([^/]+)\/events\/([^/?]+)$/.exec(new URL(href).pathname);
    if (!m?.[1] || !m[2] || !href.startsWith(api)) throw new SyncError('Not a Microsoft Graph event address');
    return { calendarId: decodeURIComponent(m[1]), eventId: decodeURIComponent(m[2]) };
  };
  const eventUrl = (eventId: string): string => `${api}/me/events/${encodeURIComponent(eventId)}`;

  async function refresh(): Promise<void> {
    tokens = await refreshMicrosoftToken(options.client, tokens, now());
    await options.onCredentials?.(tokens);
  }

  async function send(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
    retried = false,
  ): Promise<Answer> {
    if (tokens.expiresAt - EARLY_MS <= now()) await refresh();
    const headers = new Headers({
      authorization: `Bearer ${tokens.accessToken}`,
      'user-agent': 'Homa calendar sync',
      prefer: PREFER,
    });
    if (body !== undefined) headers.set('content-type', 'application/json');
    const signal = AbortSignal.timeout(policy.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
    } catch {
      if (signal.aborted) throw new SyncError(`Microsoft did not answer within ${policy.timeoutMs / 1000} seconds`);
      throw new SyncError("Couldn't reach Microsoft");
    }
    if (res.status === 401) {
      await res.body?.cancel();
      if (retried) throw new SyncError(RECONNECT_MICROSOFT);
      await refresh();
      return send(method, url, body, true);
    }
    const text = await readCapped(res, policy.maxBytes, "Microsoft's answer");
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      // Not JSON (a proxy's error page): the status says enough.
    }
    return { status: res.status, body: parsed, retryAfterMs: retryAfterOf(res, now()) };
  }

  /** Every page of a Graph collection, following @odata.nextLink. */
  async function collect(first: string, onMissing?: () => never): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let url: string | undefined = first;
    for (let page = 0; url; page++) {
      if (page >= MAX_PAGES) throw new SyncError('This Outlook calendar has too many events to sync');
      // nextLink is Graph's own URL; only follow it on the API's origin, so tokens stay there.
      if (!url.startsWith(api)) throw new SyncError('Microsoft Graph sent a next page on another address');
      const a = await send('GET', url);
      if (a.status === 404 && onMissing) onMissing();
      if (a.status !== 200) throw failed(a);
      for (const item of (a.body?.value as Record<string, unknown>[] | undefined) ?? []) items.push(item);
      const next = a.body?.['@odata.nextLink'];
      url = typeof next === 'string' ? next : undefined;
    }
    return items;
  }

  async function listCalendars(): Promise<RemoteCalendar[]> {
    const all = await collect(`${api}/me/calendars?$top=${PAGE_SIZE}`);
    return all
      .filter((c) => typeof c.id === 'string')
      .map((c) => {
        const color = typeof c.hexColor === 'string' ? c.hexColor.toLowerCase() : '';
        return {
          remoteId: c.id as string,
          name: typeof c.name === 'string' ? c.name : null,
          color: /^#[0-9a-f]{6}$/.test(color) ? color : null,
          readOnly: c.canEdit !== true,
        };
      });
  }

  /** A series master with its exceptions and cancelled occurrences, or null if Graph no longer has it. */
  async function masterOf(calendarId: string, eventId: string): Promise<GraphEvent | null> {
    const url = new URL(hrefOf(calendarId, eventId));
    url.searchParams.set('$select', `${FIELDS},cancelledOccurrences,exceptionOccurrences`);
    url.searchParams.set('$expand', `exceptionOccurrences,${UID_EXPAND}`);
    const a = await send('GET', url.href);
    if (a.status === 404 || a.status === 410) return null;
    if (a.status !== 200) throw failed(a);
    return a.body as GraphEvent;
  }

  type Read = { resources: RemoteResource[]; skipped: number; warnings: string[] };
  function read(calendarId: string, events: GraphEvent[]): Read {
    const out: Read = { resources: [], skipped: 0, warnings: [] };
    for (const e of events) {
      const r = readSeries(e, options.floatingTz);
      out.skipped += r.skipped;
      out.warnings.push(...r.warnings);
      out.resources.push({ href: hrefOf(calendarId, e.id), etag: e.changeKey ?? null, events: r.events });
    }
    return out;
  }

  async function pullChanges(
    calendar: RemoteCalendar,
    since: SyncCursor,
    known: ReadonlyMap<string, string | null> = new Map(),
  ): Promise<PullResult> {
    const calendarId = calendar.remoteId;
    if (!calendarId) throw new SyncError('This calendar has no id on Microsoft');
    const url = new URL(eventsUrl(calendarId));
    url.searchParams.set('$top', PAGE_SIZE);
    url.searchParams.set('$select', FIELDS);
    url.searchParams.set('$expand', UID_EXPAND);
    const listed = (await collect(url.href, () => {
      throw new CalendarGoneError('Microsoft no longer has this calendar, or this account lost access to it');
    })) as GraphEvent[];
    const seen = new Set<string>();
    const changed: GraphEvent[] = [];
    for (const e of listed) {
      if (typeof e?.id !== 'string' || e.isCancelled) continue;
      const href = hrefOf(calendarId, e.id);
      seen.add(href);
      // Unchanged, or our own upload coming back.
      if (e.changeKey && known.get(href) === e.changeKey) continue;
      if (e.type !== 'seriesMaster') changed.push(e);
      else {
        const whole = await masterOf(calendarId, e.id);
        if (whole) changed.push(whole);
        else seen.delete(href);
      }
    }
    const deleted = [...known.keys()].filter((href) => !seen.has(href));
    const got = read(calendarId, changed);
    const cursor: SyncCursor = { ...since, syncToken: null };
    if (!got.resources.length && !deleted.length) return { kind: 'unchanged', cursor };
    return {
      kind: 'delta',
      changed: got.resources,
      deleted,
      skipped: got.skipped,
      warnings: got.warnings.slice(0, 50),
      cursor,
    };
  }

  /** The occurrence of series `masterId` that was first at `recurrenceId` (changed or not), or null. */
  async function occurrenceOf(master: GraphEvent, recurrenceId: Date): Promise<string | null> {
    const at = recurrenceId.getTime();
    const exception = master.exceptionOccurrences?.find((x) => x.originalStart && Date.parse(x.originalStart) === at);
    if (exception) return exception.id;
    const url = new URL(`${eventUrl(master.id)}/instances`);
    url.searchParams.set('startDateTime', new Date(at).toISOString());
    url.searchParams.set('endDateTime', new Date(at + MINUTE).toISOString());
    url.searchParams.set('$select', 'id,originalStart');
    const a = await send('GET', url.href);
    if (a.status !== 200) throw pushFailed(a);
    const hit = ((a.body?.value as GraphEvent[] | undefined) ?? []).find(
      (x) => x.originalStart && Date.parse(x.originalStart) === at,
    );
    return hit?.id ?? null;
  }

  /** The event's changeKey now, or null if it's gone. */
  async function currentKey(href: string): Promise<string | null> {
    const a = await send('GET', `${href}?$select=changeKey`);
    if (a.status === 404 || a.status === 410) return null;
    if (a.status !== 200) throw pushFailed(a);
    return changeKeyOf(a);
  }

  async function pushChange(op: ChangeOp): Promise<{ etag: string | null; href?: string }> {
    const { calendarId, eventId } = parseHref(op.href);
    if (op.kind === 'delete') {
      const key = await currentKey(op.href);
      if (key === null) return { etag: null };
      if (key !== op.etag) throw new PushConflict();
      const a = await send('DELETE', op.href);
      if (ok(a) || a.status === 404 || a.status === 410) return { etag: null };
      throw pushFailed(a);
    }
    const [event] = parseIcs(op.ics, { floatingTz: options.floatingTz }).events;
    if (!event) throw new PushError("Homa couldn't turn this event into an Outlook event", false);
    let body: ReturnType<typeof graphBody>;
    try {
      body = graphBody(event);
    } catch (err) {
      if (err instanceof UnsupportedRecurrence) throw new PushError(err.message, false);
      throw err;
    }
    let href = op.href;
    let a: Answer;
    if (op.etag) {
      const key = await currentKey(href);
      if (key === null || key !== op.etag) throw new PushConflict();
      a = await send('PATCH', href, body);
      if (a.status === 404 || a.status === 410) throw new PushConflict();
    } else {
      a = await send('POST', eventsUrl(calendarId), {
        ...body,
        transactionId: transactionIdOf(event.uid),
        singleValueExtendedProperties: [{ id: HOMA_UID_PROPERTY, value: event.uid }],
      });
    }
    if (!ok(a)) throw pushFailed(a);
    const id = typeof a.body?.id === 'string' ? a.body.id : eventId;
    href = hrefOf(calendarId, id);
    let etag = changeKeyOf(a);
    if (event.rrule && (event.overrides.length || event.exdates.length)) {
      const master = await masterOf(calendarId, id);
      if (!master) throw new PushConflict();
      for (const o of event.overrides) {
        const occurrence = await occurrenceOf(master, o.recurrenceId);
        // An occurrence the series no longer has: nothing to change on Outlook.
        if (!occurrence) continue;
        const x = await send('PATCH', eventUrl(occurrence), occurrenceBody(event, o));
        if (!ok(x) && x.status !== 404) throw pushFailed(x);
      }
      for (const d of event.exdates) {
        const occurrence = await occurrenceOf(master, d);
        if (!occurrence) continue; // already cancelled
        const x = await send('DELETE', eventUrl(occurrence));
        if (!ok(x) && x.status !== 404) throw pushFailed(x);
      }
      // The master's changeKey after its occurrences changed, so the next edit matches it.
      etag = (await currentKey(href)) ?? etag;
    }
    return { etag, href };
  }

  async function fetchResource(href: string): Promise<RemoteResource | null> {
    const { calendarId, eventId } = parseHref(href);
    if (eventId.startsWith('new-')) return null;
    const master = await masterOf(calendarId, eventId);
    return master && !master.isCancelled ? (read(calendarId, [master]).resources[0] ?? null) : null;
  }

  return {
    listCalendars,
    pullChanges,
    pushChange,
    fetchResource,
    // Graph picks the id when the event is created; pushChange returns the real href.
    newHref: (calendarId: string, uid: string): string => hrefOf(calendarId, `new-${transactionIdOf(uid)}`),
  };
}
