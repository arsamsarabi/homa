// A small fake of the Microsoft identity platform's token endpoint and Graph v1.0 calendars, for
// tests (here and in the server). It keeps the documented rules Homa relies on: bearer tokens,
// refresh with a rotated refresh token and invalid_grant, /me/calendars and calendar event listings
// paged with @odata.nextLink (single events and series masters only), Homa's UID property only when
// $expand names it exactly (the name is case-sensitive), cancelledOccurrences and exceptionOccurrences
// only on a GET of one event that $selects them, instances (startDateTime and endDateTime required),
// create with transactionId (a retry returns the same event), read-only fields refused, all-day
// times at midnight in one zone, a range.startDate equal to the start's date, 404 for a calendar
// that's gone and 429 with Retry-After on demand. Every change gives the event (for an occurrence,
// its series master) a new changeKey.
import { expand } from '@homa/core';
import { type GraphEvent, type GraphTime, ianaZone, instantOf, rruleOf } from '../microsoft/mapping';
import type { MicrosoftEndpoints } from '../microsoft/oauth';

type Stored = GraphEvent & {
  calendarId: string;
  transactionId?: string;
  props: { id: string; value: string }[];
  /** Exceptions by original start (ISO, UTC). */
  exceptions: Map<string, GraphEvent>;
  /** Original starts (ISO, UTC) of cancelled occurrences. */
  cancelled: Set<string>;
};
export type FakeMsCalendar = { id: string; name: string; canEdit: boolean; hexColor?: string };

export type FakeMicrosoft = {
  endpoints: MicrosoftEndpoints;
  calendars: FakeMsCalendar[];
  /** Events by id (series masters and single events). */
  events: Map<string, Stored>;
  /** "METHOD path?query" of every request. */
  requests: string[];
  /** The bodies posted to the token endpoint. */
  tokenRequests: URLSearchParams[];
  /** Adds or replaces an event, as if changed in Outlook. Returns it with its new changeKey. */
  put(calendarId: string, event: GraphEvent & { exceptions?: GraphEvent[]; cancelled?: string[] }): Stored;
  get(id: string): Stored | undefined;
  /** Changes an event's fields, as if edited in Outlook (a new changeKey). */
  update(id: string, change: Partial<GraphEvent>): void;
  /** Changes one occurrence in Outlook, as an exception of its series. */
  changeOccurrence(masterId: string, originalStart: string, change: Partial<GraphEvent>): void;
  /** Cancels one occurrence in Outlook. */
  cancelOccurrence(masterId: string, originalStart: string): void;
  state: {
    accessToken: string;
    refreshToken: string;
    /** invalid_grant on refresh. */
    revoked: boolean;
    pageSize: number;
    /** Calendars deleted in Outlook, or no longer shared with this account: 404. */
    missingCalendars: Set<string>;
    /** The next this many API requests answer 429 with Retry-After: 7. */
    throttle: number;
    idToken: Record<string, string>;
    /** The scopes the token endpoint says were granted. */
    scope: string;
  };
  stop(): void;
};

const json = (body: unknown, status = 200, headers?: Record<string, string>): Response =>
  Response.json(body, { status, headers });
const error = (status: number, code: string, message: string): Response => json({ error: { code, message } }, status);
const jwt = (payload: object): string => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const READ_ONLY = ['id', 'changeKey', 'iCalUId', 'type', 'seriesMasterId', 'originalStart', 'createdDateTime'];
const PATTERN_FIELDS: Record<string, string[]> = {
  daily: ['interval'],
  weekly: ['interval', 'daysOfWeek', 'firstDayOfWeek'],
  absoluteMonthly: ['interval', 'dayOfMonth'],
  relativeMonthly: ['interval', 'daysOfWeek'],
  absoluteYearly: ['interval', 'dayOfMonth', 'month'],
  relativeYearly: ['interval', 'daysOfWeek', 'month'],
};
const PROPERTY_ID = /^String \{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\} Name \w+$/i;

/** A Graph time in UTC, as Graph answers with `Prefer: outlook.timezone="UTC"`. */
const utc = (t: GraphTime | undefined, allDay: boolean): GraphTime | undefined => {
  if (!t || allDay) return t; // all-day times stay midnights
  const at = instantOf(t);
  return at ? { dateTime: `${at.toISOString().slice(0, 19)}.0000000`, timeZone: 'UTC' } : t;
};

/** Why `body` isn't a valid event body, or null. */
function invalid(body: Record<string, unknown>, creating: boolean): string | null {
  for (const f of READ_ONLY) if (f in body) return `Property '${f}' is read-only`;
  const start = body.start as GraphTime | undefined;
  const end = body.end as GraphTime | undefined;
  if (creating && (!start || !end)) return 'An event needs a start and an end';
  for (const t of [start, end])
    if (t && (!t.dateTime || !t.timeZone || !ianaZone(t.timeZone))) return 'Invalid dateTimeTimeZone';
  if (body.isAllDay === true && start && end) {
    if (!start.dateTime.slice(11).startsWith('00:00:00') || !end.dateTime.slice(11).startsWith('00:00:00'))
      return 'All-day events must start and end at midnight';
    if (start.timeZone !== end.timeZone) return 'All-day events must start and end in the same time zone';
  }
  const r = body.recurrence as GraphEvent['recurrence'];
  if (r) {
    const required = PATTERN_FIELDS[r.pattern?.type ?? ''];
    if (!required) return 'Invalid recurrence pattern type';
    for (const f of required) if ((r.pattern as Record<string, unknown>)[f] === undefined) return `Missing ${f}`;
    if (start && r.range?.startDate !== start.dateTime.slice(0, 10))
      return 'The recurrence range startDate must match the start of the event';
    if (r.range?.type === 'endDate' && !r.range.endDate) return 'Missing endDate';
    if (r.range?.type === 'numbered' && !(Number(r.range.numberOfOccurrences) > 0))
      return 'Missing numberOfOccurrences';
  }
  const props = body.singleValueExtendedProperties as { id?: string; value?: unknown }[] | undefined;
  for (const p of props ?? [])
    if (!p.id || !PROPERTY_ID.test(p.id) || typeof p.value !== 'string') return 'Invalid extended property';
  return null;
}

export function fakeMicrosoft(): FakeMicrosoft {
  let seq = 0;
  let issued = 0;
  let ids = 0;
  const events = new Map<string, Stored>();
  const requests: string[] = [];
  const tokenRequests: URLSearchParams[] = [];
  const calendars: FakeMsCalendar[] = [];
  const state: FakeMicrosoft['state'] = {
    accessToken: 'at-0',
    refreshToken: 'rt-0',
    revoked: false,
    pageSize: 2,
    missingCalendars: new Set<string>(),
    throttle: 0,
    idToken: { preferred_username: 'ada@outlook.com' },
    scope: 'openid email https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/User.Read',
  };
  const bump = (e: Stored): Stored => {
    e.changeKey = `ck-${++seq}`;
    return e;
  };

  const put: FakeMicrosoft['put'] = (
    calendarId: string,
    { exceptions, cancelled, ...e }: Parameters<FakeMicrosoft['put']>[1],
  ): Stored => {
    const old = events.get(e.id);
    const stored: Stored = {
      type: e.recurrence ? 'seriesMaster' : 'singleInstance',
      iCalUId: `040000008200E00074C5B7101A82E008-${e.id}`,
      originalStartTimeZone: e.start?.timeZone,
      ...e,
      calendarId,
      props: old?.props ?? [],
      exceptions: new Map((exceptions ?? []).map((x) => [x.originalStart ?? '', x])),
      cancelled: new Set(cancelled ?? []),
    };
    events.set(e.id, bump(stored));
    return stored;
  };

  /** The series' occurrences in [from, to): unchanged ones and exceptions, without cancelled ones. */
  function occurrences(m: Stored, from: Date, to: Date): GraphEvent[] {
    const start = instantOf(m.start);
    const end = instantOf(m.end);
    const zone = ianaZone(m.originalStartTimeZone ?? m.start?.timeZone) ?? 'UTC';
    if (!start || !end || !m.recurrence) return [];
    const rrule = rruleOf(m.recurrence, m.isAllDay === true, zone);
    if (!rrule) return [];
    const out: GraphEvent[] = [];
    for (const o of expand({ start, end, tz: zone, rrule, exdates: [] }, from, to)) {
      const original = o.recurrenceId.toISOString().replace('.000Z', 'Z');
      if (m.cancelled.has(original)) continue;
      const x = m.exceptions.get(original);
      const iso = (d: Date): GraphTime => ({ dateTime: d.toISOString().slice(0, 19), timeZone: 'UTC' });
      out.push({
        id: `${m.id}_OCC_${original}`,
        type: x ? 'exception' : 'occurrence',
        seriesMasterId: m.id,
        originalStart: original,
        start: x?.start ?? iso(o.start),
        end: x?.end ?? iso(o.end),
        subject: x?.subject ?? m.subject,
      });
    }
    return out;
  }

  /** The event as Graph answers it: `select` limits the fields, `expand` the navigation properties. */
  function out(e: Stored, q: URLSearchParams, single: boolean): Record<string, unknown> {
    const { calendarId: _c, transactionId, props, exceptions: _x, cancelled, ...rest } = e;
    const allDay = e.isAllDay === true;
    const full: Record<string, unknown> = {
      '@odata.etag': `W/"${e.changeKey}"`,
      ...rest,
      start: utc(e.start, allDay),
      end: utc(e.end, allDay),
      ...(transactionId ? { transactionId } : {}),
    };
    const select = q.get('$select')?.split(',');
    const expandParam = q.get('$expand') ?? '';
    if (single && select?.includes('cancelledOccurrences') && e.type === 'seriesMaster') {
      const zone = ianaZone(e.originalStartTimeZone ?? e.start?.timeZone) ?? 'UTC';
      full.cancelledOccurrences = [...cancelled].map((iso) => {
        const date = Temporal.Instant.from(iso).toZonedDateTimeISO(zone).toPlainDate().toString();
        return `OID.${e.id}.${date}`;
      });
    }
    if (single && select?.includes('exceptionOccurrences') && /(^|,)exceptionOccurrences/.test(expandParam))
      full.exceptionOccurrences = [...e.exceptions.entries()].map(([original, x]) => ({
        ...x,
        id: `${e.id}_OCC_${original}`,
        type: 'exception',
        seriesMasterId: e.id,
        originalStart: original,
        start: utc(x.start, allDay),
        end: utc(x.end, allDay),
      }));
    const m = /singleValueExtendedProperties\(\$filter=id eq '([^']+)'\)/.exec(expandParam);
    if (m) {
      // As Graph: the GUID and type match any case, the name exactly.
      const hit = props.filter((p) => p.id === m[1] || p.id.toLowerCase() === m[1]?.toLowerCase());
      const exact = hit.filter((p) => p.id.split(' Name ')[1] === m[1]?.split(' Name ')[1]);
      if (exact.length) full.singleValueExtendedProperties = exact;
    }
    if (!select) return full;
    const keep = new Set([...select, 'id', '@odata.etag', 'singleValueExtendedProperties']);
    return Object.fromEntries(Object.entries(full).filter(([k]) => keep.has(k)));
  }

  function token(body: URLSearchParams): Response {
    tokenRequests.push(body);
    const grant = body.get('grant_type');
    if (body.get('client_secret') !== 'secret') return json({ error: 'invalid_client' }, 401);
    if (grant === 'refresh_token' && (state.revoked || !body.get('refresh_token')?.startsWith('rt-')))
      return json({ error: 'invalid_grant', error_description: 'AADSTS70000: The refresh token has expired.' }, 400);
    if (grant === 'authorization_code' && (body.get('code') !== 'good-code' || !body.get('code_verifier')))
      return json({ error: 'invalid_grant' }, 400);
    state.accessToken = `at-${++issued}`;
    // Microsoft rotates: every answer carries a new refresh token.
    state.refreshToken = `rt-${issued}`;
    return json({
      token_type: 'Bearer',
      access_token: state.accessToken,
      refresh_token: state.refreshToken,
      expires_in: 3599,
      scope: state.scope,
      ...(grant === 'authorization_code' && { id_token: jwt(state.idToken) }),
    });
  }

  /** A page of `items` and, if there are more, a nextLink back to the same query. */
  function page(url: URL, items: unknown[]): Response {
    const skip = Number(url.searchParams.get('$skip') ?? 0);
    const size = Math.min(state.pageSize, Number(url.searchParams.get('$top') ?? state.pageSize));
    const next = new URL(url);
    next.searchParams.set('$skip', String(skip + size));
    return json({
      value: items.slice(skip, skip + size),
      ...(skip + size < items.length ? { '@odata.nextLink': next.href } : {}),
    });
  }

  /** An event id: a stored one, or `{master}_OCC_{original start}` for an occurrence. */
  const find = (id: string): { event?: Stored; master?: Stored; original?: string } => {
    const [masterId, original] = id.split('_OCC_');
    if (original && masterId) return { master: events.get(masterId), original };
    const event = events.get(id);
    return event?.isCancelled ? {} : { event };
  };

  async function event(req: Request, url: URL, id: string, calendarId?: string): Promise<Response> {
    const { event: e, master, original } = find(id);
    if (master && original) {
      if (req.method === 'DELETE') {
        master.cancelled.add(original);
        master.exceptions.delete(original);
        bump(master);
        return new Response(null, { status: 204 });
      }
      if (req.method === 'PATCH') {
        const body = (await req.json()) as Record<string, unknown>;
        const why = invalid(body, false);
        if (why || 'recurrence' in body)
          return error(400, 'ErrorInvalidRequest', why ?? 'An occurrence has no recurrence');
        master.exceptions.set(original, { ...master.exceptions.get(original), ...(body as Partial<GraphEvent>), id });
        bump(master);
        return json({ id, changeKey: master.changeKey });
      }
      return error(405, 'ErrorInvalidRequest', 'Not supported by this fake');
    }
    if (!e || (calendarId && e.calendarId !== calendarId))
      return error(404, 'ErrorItemNotFound', 'The specified object was not found in the store.');
    if (req.method === 'GET') return json(out(e, url.searchParams, true));
    if (req.method === 'DELETE') {
      events.delete(id);
      return new Response(null, { status: 204 });
    }
    const body = (await req.json()) as Record<string, unknown>;
    const why = invalid({ start: e.start, ...body }, false);
    if (why) return error(400, 'ErrorInvalidRequest', why);
    if ('transactionId' in body) return error(400, 'ErrorInvalidRequest', "transactionId can't be changed");
    Object.assign(e, body);
    if (body.recurrence) e.type = 'seriesMaster';
    if (body.start) e.originalStartTimeZone = (body.start as GraphTime).timeZone;
    return json(out(bump(e), new URLSearchParams(), false));
  }

  async function create(req: Request, calendarId: string): Promise<Response> {
    const body = (await req.json()) as Record<string, unknown>;
    const why = invalid(body, true);
    if (why) return error(400, 'ErrorInvalidRequest', why);
    const calendar = calendars.find((c) => c.id === calendarId);
    if (!calendar) return error(404, 'ErrorItemNotFound', 'The specified object was not found in the store.');
    if (!calendar.canEdit) return error(403, 'ErrorAccessDenied', 'Access is denied.');
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId : undefined;
    const again = transactionId ? [...events.values()].find((x) => x.transactionId === transactionId) : undefined;
    if (again) return json(out(again, new URLSearchParams(), false), 201);
    const { singleValueExtendedProperties: props, ...rest } = body as GraphEvent & Record<string, unknown>;
    const stored = put(calendarId, { ...(rest as GraphEvent), id: `AAMk-${++ids}` });
    stored.transactionId = transactionId;
    stored.props = props ?? [];
    // As Graph: the answer doesn't include the extended properties.
    return json(out(stored, new URLSearchParams(), false), 201);
  }

  const server = Bun.serve({
    port: 0,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      requests.push(`${req.method} ${url.pathname}${url.search}`);
      if (url.pathname === '/token') return token(new URLSearchParams(await req.text()));
      if (req.headers.get('authorization') !== `Bearer ${state.accessToken}`)
        return error(401, 'InvalidAuthenticationToken', 'Access token has expired or is not yet valid.');
      if (state.throttle > 0) {
        state.throttle--;
        return json({ error: { code: 'TooManyRequests', message: 'Too many requests' } }, 429, { 'retry-after': '7' });
      }
      const path = url.pathname.replace(/^\/v1\.0/, '');
      if (path === '/me/calendars') return page(url, calendars);
      let m = /^\/me\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(path);
      if (m?.[1]) {
        const calendarId = decodeURIComponent(m[1]);
        if (state.missingCalendars.has(calendarId))
          return error(404, 'ErrorItemNotFound', 'The specified object was not found in the store.');
        if (m[2]) return event(req, url, decodeURIComponent(m[2]), calendarId);
        if (req.method === 'POST') return create(req, calendarId);
        const listed = [...events.values()]
          .filter((e) => e.calendarId === calendarId && !e.isCancelled)
          .map((e) => out(e, url.searchParams, false));
        return page(url, listed);
      }
      m = /^\/me\/events\/([^/]+)\/instances$/.exec(path);
      if (m?.[1]) {
        const from = url.searchParams.get('startDateTime');
        const to = url.searchParams.get('endDateTime');
        if (!from || !to) return error(400, 'ErrorInvalidParameter', 'startDateTime and endDateTime are required');
        const master = events.get(decodeURIComponent(m[1]));
        if (!master) return error(404, 'ErrorItemNotFound', 'The specified object was not found in the store.');
        return page(url, occurrences(master, new Date(from), new Date(to)));
      }
      m = /^\/me\/events\/([^/]+)$/.exec(path);
      if (m?.[1]) return event(req, url, decodeURIComponent(m[1]));
      return error(404, 'ResourceNotFound', 'Not in this fake');
    },
  });
  const base = `http://127.0.0.1:${server.port}`;

  return {
    endpoints: { auth: `${base}/authorize`, token: `${base}/token`, api: `${base}/v1.0` },
    calendars,
    events,
    requests,
    tokenRequests,
    put,
    get: (id: string): Stored | undefined => events.get(id),
    update: (id: string, change: Partial<GraphEvent>): void => {
      const e = events.get(id);
      if (!e) throw new Error(`no event ${id}`);
      bump(Object.assign(e, change));
    },
    changeOccurrence: (masterId: string, originalStart: string, change: Partial<GraphEvent>): void => {
      const master = events.get(masterId);
      if (!master) throw new Error(`no series ${masterId}`);
      master.exceptions.set(originalStart, { ...master.exceptions.get(originalStart), id: '', ...change });
      bump(master);
    },
    cancelOccurrence: (masterId: string, originalStart: string): void => {
      const master = events.get(masterId);
      if (!master) throw new Error(`no series ${masterId}`);
      master.cancelled.add(originalStart);
      master.exceptions.delete(originalStart);
      bump(master);
    },
    state,
    stop: (): void => {
      server.stop(true);
    },
  };
}
