// Google Calendar (API v3, plain REST) with OAuth tokens.
//
// Calendars: calendarList; `reader` and `freeBusyReader` calendars are read-only in Homa.
// Pull: events.list with singleEvents=false, so a series comes as its master plus one event per
// changed or cancelled occurrence. Without a syncToken it lists everything (and what Homa holds
// that isn't listed is gone); with one, only what changed. A 410 means the token expired: list
// everything again. Each changed series is fetched whole (events.list by iCalUID) and read with
// mapping.ts. One resource per series; its href is the master's URL and its ETag the master's.
// Push: insert (with an id derived from the UID) or patch with If-Match, then patch each override's
// instance; delete with If-Match. A 412 is a PushConflict, and the caller lets the remote win.
// Tokens: refreshed a minute before they expire, or once after a 401; new ones go to
// `onCredentials` to be stored. invalid_grant means the user has to connect again.
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
  type GoogleEvent,
  type GoogleSeries,
  googleBody,
  googleEventId,
  HOMA_UID,
  instanceBody,
  instanceId,
  readSeries,
} from './mapping';
import { endpointsOf, type GoogleClient, type GoogleCredentials, RECONNECT_GOOGLE, refreshGoogleToken } from './oauth';

export type GoogleAdapterOptions = {
  /** IANA zone for floating times: the owner's home zone. */
  floatingTz: string;
  client: GoogleClient;
  /** Stores refreshed tokens. */
  onCredentials?: (credentials: GoogleCredentials) => Promise<void>;
  policy?: FetchPolicy;
  now?: () => number;
};

type Answer = { status: number; body: Record<string, unknown> | null };
type Listing = { items: GoogleEvent[]; timeZone: string; nextSyncToken: string | null };

/** Events per page, and most pages per listing (so at most 125,000 events). */
const PAGE_SIZE = '250';
const MAX_PAGES = 500;
/** Refresh this long before the access token expires. */
const EARLY_MS = 60_000;

const WRITABLE_ROLES = new Set(['owner', 'writer']);

const reasonOf = (a: Answer): string | undefined => {
  const errors = (a.body?.error as { errors?: { reason?: string }[] } | undefined)?.errors;
  return errors?.[0]?.reason;
};
const rateLimited = (a: Answer): boolean =>
  a.status === 429 || (a.status === 403 && /rateLimitExceeded/i.test(reasonOf(a) ?? ''));

const failed = (a: Answer): SyncError =>
  rateLimited(a)
    ? new SyncError('Google is limiting requests from Homa for now; the next sync tries again')
    : new SyncError(`Google Calendar answered ${a.status}`);

/** Google's own explanation, if it gave one (never carries tokens). */
const googleMessage = (a: Answer): string => {
  const message = (a.body?.error as { message?: unknown } | undefined)?.message;
  return typeof message === 'string' && message ? `: ${message.slice(0, 200)}` : '';
};

const pushFailed = (a: Answer): PushError =>
  new PushError(
    `Google Calendar refused the change (${a.status})${googleMessage(a)}`,
    a.status >= 500 || a.status === 408 || rateLimited(a),
  );

/**
 * @example
 * const adapter = googleAdapter(credentials, { floatingTz, client, onCredentials: save });
 * const calendars = await adapter.listCalendars();
 */
export function googleAdapter(credentials: GoogleCredentials, options: GoogleAdapterOptions): SyncAdapter {
  const policy = options.policy ?? DEFAULT_FETCH_POLICY;
  const now = options.now ?? Date.now;
  const api = endpointsOf(options.client).api;
  let tokens = credentials;

  const eventsUrl = (calendarId: string): string => `${api}/calendars/${encodeURIComponent(calendarId)}/events`;
  const hrefOf = (calendarId: string, eventId: string): string =>
    `${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`;
  /** The calendar and event ids in an href this adapter made. */
  const parseHref = (href: string): { calendarId: string; eventId: string } => {
    const m = /\/calendars\/([^/]+)\/events\/([^/?]+)$/.exec(new URL(href).pathname);
    if (!m?.[1] || !m[2] || !href.startsWith(api)) throw new SyncError('Not a Google Calendar event address');
    return { calendarId: decodeURIComponent(m[1]), eventId: decodeURIComponent(m[2]) };
  };

  async function refresh(): Promise<void> {
    tokens = await refreshGoogleToken(options.client, tokens, now());
    await options.onCredentials?.(tokens);
  }

  async function send(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    init: { body?: unknown; ifMatch?: string } = {},
    retried = false,
  ): Promise<Answer> {
    if (tokens.expiresAt - EARLY_MS <= now()) await refresh();
    const headers = new Headers({ authorization: `Bearer ${tokens.accessToken}`, 'user-agent': 'Homa calendar sync' });
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    if (init.ifMatch) headers.set('if-match', init.ifMatch);
    const signal = AbortSignal.timeout(policy.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal,
      });
    } catch {
      if (signal.aborted) throw new SyncError(`Google did not answer within ${policy.timeoutMs / 1000} seconds`);
      throw new SyncError("Couldn't reach Google");
    }
    if (res.status === 401) {
      await res.body?.cancel();
      if (retried) throw new SyncError(RECONNECT_GOOGLE);
      await refresh();
      return send(method, url, init, true);
    }
    const text = await readCapped(res, policy.maxBytes, "Google's answer");
    let body: Record<string, unknown> | null = null;
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      // Not JSON (a proxy's error page): the status says enough.
    }
    return { status: res.status, body };
  }

  async function listCalendars(): Promise<RemoteCalendar[]> {
    const out: RemoteCalendar[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${api}/users/me/calendarList`);
      url.searchParams.set('maxResults', PAGE_SIZE);
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const a = await send('GET', url.href);
      if (a.status !== 200) throw failed(a);
      for (const c of (a.body?.items as Record<string, unknown>[] | undefined) ?? []) {
        if (typeof c.id !== 'string' || c.deleted === true) continue;
        const color = typeof c.backgroundColor === 'string' ? c.backgroundColor.toLowerCase() : null;
        const name = c.summaryOverride ?? c.summary;
        out.push({
          remoteId: c.id,
          name: typeof name === 'string' ? name : null,
          color: color && /^#[0-9a-f]{6}$/.test(color) ? color : null,
          readOnly: !WRITABLE_ROLES.has(String(c.accessRole)),
        });
      }
      pageToken = typeof a.body?.nextPageToken === 'string' ? a.body.nextPageToken : undefined;
      if (!pageToken) break;
    }
    return out;
  }

  /** Every page of events.list with `params`; null for a 410 (an expired sync token). */
  async function listEvents(calendarId: string, params: Record<string, string>): Promise<Listing | null> {
    const items: GoogleEvent[] = [];
    let timeZone = 'UTC';
    let pageToken: string | undefined;
    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES) throw new SyncError('This Google calendar has too many events to sync');
      const url = new URL(eventsUrl(calendarId));
      for (const [k, v] of Object.entries({ singleEvents: 'false', maxResults: PAGE_SIZE, ...params }))
        url.searchParams.set(k, v);
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const a = await send('GET', url.href);
      if (a.status === 410) return null;
      if (a.status === 404)
        throw new CalendarGoneError('Google no longer has this calendar, or this account lost access to it');
      if (a.status !== 200) throw failed(a);
      if (typeof a.body?.timeZone === 'string') timeZone = a.body.timeZone;
      for (const e of (a.body?.items as GoogleEvent[] | undefined) ?? [])
        if (typeof e?.id === 'string' && e.eventType !== 'workingLocation') items.push(e);
      pageToken = typeof a.body?.nextPageToken === 'string' ? a.body.nextPageToken : undefined;
      if (!pageToken)
        return {
          items,
          timeZone,
          nextSyncToken: typeof a.body?.nextSyncToken === 'string' ? a.body.nextSyncToken : null,
        };
    }
  }

  /** The whole series `seriesId` (master and occurrences), or null if Google no longer has it. */
  async function seriesOf(
    calendarId: string,
    seriesId: string,
    uid?: string,
  ): Promise<{ series: GoogleSeries; timeZone: string } | null> {
    let iCalUID = uid;
    if (!iCalUID) {
      const a = await send('GET', hrefOf(calendarId, seriesId));
      if (a.status === 404 || a.status === 410) return null;
      if (a.status !== 200) throw failed(a);
      if (a.body?.status === 'cancelled' || typeof a.body?.iCalUID !== 'string') return null;
      iCalUID = a.body.iCalUID;
    }
    const listing = await listEvents(calendarId, { iCalUID, showDeleted: 'true' });
    const master = listing?.items.find((e) => e.id === seriesId && e.status !== 'cancelled');
    if (!listing || !master) return null;
    return {
      series: { master, exceptions: listing.items.filter((e) => e.recurringEventId === seriesId) },
      timeZone: listing.timeZone,
    };
  }

  type Read = { resources: RemoteResource[]; skipped: number; warnings: string[] };
  function read(calendarId: string, all: { series: GoogleSeries; timeZone: string }[]): Read {
    const out: Read = { resources: [], skipped: 0, warnings: [] };
    for (const { series, timeZone } of all) {
      const r = readSeries(series, timeZone, options.floatingTz);
      out.skipped += r.skipped;
      out.warnings.push(...r.warnings);
      out.resources.push({
        href: hrefOf(calendarId, series.master.id),
        etag: series.master.etag ?? null,
        events: r.events,
      });
    }
    return out;
  }

  /** A full listing grouped into series; occurrences whose series isn't there are skipped. */
  function group(listing: Listing): { series: { series: GoogleSeries; timeZone: string }[]; orphans: number } {
    const byId = new Map<string, GoogleSeries>();
    const exceptions: GoogleEvent[] = [];
    for (const e of listing.items) {
      if (e.recurringEventId) exceptions.push(e);
      else if (e.status !== 'cancelled') byId.set(e.id, { master: e, exceptions: [] });
    }
    let orphans = 0;
    for (const x of exceptions) {
      const s = x.recurringEventId ? byId.get(x.recurringEventId) : undefined;
      if (s) s.exceptions.push(x);
      else if (x.status !== 'cancelled') orphans++;
    }
    return { series: [...byId.values()].map((series) => ({ series, timeZone: listing.timeZone })), orphans };
  }

  /** The series a delta touches: changed ones fetched whole, deleted ones as hrefs. Own uploads are skipped. */
  async function delta(
    calendarId: string,
    listing: Listing,
    known: ReadonlyMap<string, string | null>,
  ): Promise<{ series: { series: GoogleSeries; timeZone: string }[]; deleted: string[] }> {
    const deleted: string[] = [];
    const masters = new Map<string, GoogleEvent>();
    // Series id → its iCalUID if the delta says, for series with a changed occurrence.
    const occurrenceChanged = new Map<string, string | undefined>();
    for (const e of listing.items) {
      if (e.recurringEventId)
        occurrenceChanged.set(e.recurringEventId, e.iCalUID ?? occurrenceChanged.get(e.recurringEventId));
      else if (e.status === 'cancelled') deleted.push(hrefOf(calendarId, e.id));
      else masters.set(e.id, e);
    }
    const out: { series: GoogleSeries; timeZone: string }[] = [];
    const gone = new Set(deleted);
    for (const id of new Set([...masters.keys(), ...occurrenceChanged.keys()])) {
      const href = hrefOf(calendarId, id);
      if (gone.has(href)) continue;
      const master = masters.get(id);
      // Our own upload coming back, or an unchanged master: nothing to fetch.
      if (master && !occurrenceChanged.has(id) && master.etag && known.get(href) === master.etag) continue;
      if (master && !master.recurrence?.length) {
        out.push({ series: { master, exceptions: [] }, timeZone: listing.timeZone });
        continue;
      }
      const whole = await seriesOf(calendarId, id, master?.iCalUID ?? occurrenceChanged.get(id));
      if (whole) out.push(whole);
      else deleted.push(href);
    }
    return { series: out, deleted };
  }

  async function pullChanges(
    calendar: RemoteCalendar,
    since: SyncCursor,
    known: ReadonlyMap<string, string | null> = new Map(),
  ): Promise<PullResult> {
    const calendarId = calendar.remoteId;
    if (!calendarId) throw new SyncError('This calendar has no id on Google');
    let incremental = since.syncToken !== null;
    let listing = incremental ? await listEvents(calendarId, { syncToken: since.syncToken ?? '' }) : null;
    if (!listing) {
      incremental = false;
      listing = await listEvents(calendarId, {});
      if (!listing) throw new SyncError('Google Calendar answered 410');
    }
    const cursor: SyncCursor = { ...since, syncToken: listing.nextSyncToken };
    let found: { series: { series: GoogleSeries; timeZone: string }[]; deleted: string[] };
    let skipped = 0;
    if (incremental) found = await delta(calendarId, listing, known);
    else {
      const grouped = group(listing);
      skipped = grouped.orphans;
      const listed = new Set(grouped.series.map((s) => hrefOf(calendarId, s.series.master.id)));
      found = { series: grouped.series, deleted: [...known.keys()].filter((href) => !listed.has(href)) };
    }
    const got = read(calendarId, found.series);
    if (!got.resources.length && !found.deleted.length) return { kind: 'unchanged', cursor };
    return {
      kind: 'delta',
      changed: got.resources,
      deleted: found.deleted,
      skipped: skipped + got.skipped,
      warnings: got.warnings.slice(0, 50),
      cursor,
    };
  }

  async function pushChange(op: ChangeOp): Promise<{ etag: string | null }> {
    const { calendarId, eventId } = parseHref(op.href);
    const href = hrefOf(calendarId, eventId);
    if (op.kind === 'delete') {
      const a = await send('DELETE', href, { ifMatch: op.etag });
      if ((a.status >= 200 && a.status < 300) || a.status === 404 || a.status === 410) return { etag: null };
      if (a.status === 412) throw new PushConflict();
      throw pushFailed(a);
    }
    const [event] = parseIcs(op.ics, { floatingTz: options.floatingTz }).events;
    if (!event) throw new PushError("Homa couldn't turn this event into a Google event", false);
    const body = googleBody(event);
    let a: Answer;
    if (op.etag) {
      a = await send('PATCH', href, { body, ifMatch: op.etag });
      if (a.status === 412 || a.status === 404 || a.status === 410) throw new PushConflict();
    } else {
      const homa = { extendedProperties: { private: { [HOMA_UID]: event.uid } } };
      a = await send('POST', eventsUrl(calendarId), { body: { id: eventId, ...homa, ...body } });
      // The id is ours (from the UID): an earlier try got through, or the event was deleted and is back.
      if (a.status === 409) a = await send('PATCH', href, { body: { ...homa, ...body, status: 'confirmed' } });
    }
    if (a.status < 200 || a.status >= 300) throw pushFailed(a);
    let etag = typeof a.body?.etag === 'string' ? a.body.etag : null;
    if (!event.overrides.length) return { etag };
    for (const o of event.overrides) {
      const url = hrefOf(calendarId, instanceId(eventId, o.recurrenceId, event.allDay));
      const x = await send('PATCH', url, { body: { ...instanceBody(event, o), status: 'confirmed' } });
      // An occurrence the series no longer has: nothing to change on Google.
      if ((x.status < 200 || x.status >= 300) && x.status !== 404 && x.status !== 410) throw pushFailed(x);
    }
    // The master's ETag after its occurrences changed, so the next edit matches it.
    const after = await send('GET', href);
    if (after.status === 200 && typeof after.body?.etag === 'string') etag = after.body.etag;
    return { etag };
  }

  async function fetchResource(href: string): Promise<RemoteResource | null> {
    const { calendarId, eventId } = parseHref(href);
    const whole = await seriesOf(calendarId, eventId);
    return whole ? (read(calendarId, [whole]).resources[0] ?? null) : null;
  }

  return {
    listCalendars,
    pullChanges,
    pushChange,
    fetchResource,
    newHref: (calendarId: string, uid: string): string => hrefOf(calendarId, googleEventId(uid)),
  };
}
