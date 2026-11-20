// A small fake of Google's OAuth token endpoint and Calendar API v3, for tests (here and in the
// server). Enough of the real behaviour: bearer tokens, refresh and invalid_grant, calendarList,
// events.list with paging, syncToken (and 410 for an expired one) and iCalUID, get, insert (409
// for a taken id), patch and delete with If-Match (412), and occurrences of a series patched by
// instance id. Every event change bumps a sequence number, which is the event's ETag.

import type { GoogleEvent } from '../google/mapping';
import type { GoogleEndpoints } from '../google/oauth';

type Stored = GoogleEvent & { seq: number };
export type FakeCalendar = { id: string; summary: string; accessRole: string; backgroundColor?: string };

export type FakeGoogle = {
  endpoints: GoogleEndpoints;
  calendars: FakeCalendar[];
  /** Events per calendar id. */
  events: Map<string, Map<string, Stored>>;
  /** "METHOD path?query" of every request. */
  requests: string[];
  /** The bodies posted to the token endpoint. */
  tokenRequests: URLSearchParams[];
  /** Adds or replaces an event, as if changed on Google. Returns it with its new ETag. */
  put(calendarId: string, event: GoogleEvent): Stored;
  /** Marks an event deleted, as Google does. */
  cancel(calendarId: string, id: string): void;
  get(calendarId: string, id: string): Stored | undefined;
  state: {
    accessToken: string;
    refreshToken: string;
    /** invalid_grant on refresh. */
    revoked: boolean;
    /** 410 for every syncToken. */
    expireSyncTokens: boolean;
    pageSize: number;
    email: string;
    /** The scopes the token endpoint says were granted. */
    scope: string;
  };
  stop(): void;
};

const json = (body: unknown, status = 200): Response => Response.json(body, { status });
const jwt = (payload: object): string => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

export function fakeGoogle(): FakeGoogle {
  let seq = 0;
  let issued = 0;
  const events = new Map<string, Map<string, Stored>>();
  const requests: string[] = [];
  const tokenRequests: URLSearchParams[] = [];
  const state: FakeGoogle['state'] = {
    accessToken: 'at-0',
    refreshToken: 'rt-0',
    revoked: false,
    expireSyncTokens: false,
    pageSize: 2,
    email: 'ada@example.com',
    scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar',
  };
  const calendars: FakeCalendar[] = [];
  const calendarOf = (id: string): Map<string, Stored> => {
    let c = events.get(id);
    if (!c) {
      c = new Map();
      events.set(id, c);
    }
    return c;
  };
  const put = (calendarId: string, e: GoogleEvent): Stored => {
    seq++;
    const stored = { status: 'confirmed', ...e, seq, etag: `"${seq}"` };
    calendarOf(calendarId).set(e.id, stored);
    return stored;
  };
  const cancel = (calendarId: string, id: string): void => {
    const e = calendarOf(calendarId).get(id);
    if (e) put(calendarId, { ...e, status: 'cancelled' });
  };
  const out = ({ seq: _, ...e }: Stored): GoogleEvent => e;

  function token(body: URLSearchParams): Response {
    tokenRequests.push(body);
    const grant = body.get('grant_type');
    if (grant === 'refresh_token' && (state.revoked || body.get('refresh_token') !== state.refreshToken))
      return json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
    if (grant === 'authorization_code' && body.get('code') !== 'good-code')
      return json({ error: 'invalid_grant' }, 400);
    state.accessToken = `at-${++issued}`;
    return json({
      access_token: state.accessToken,
      expires_in: 3599,
      token_type: 'Bearer',
      scope: state.scope,
      ...(grant === 'authorization_code' && {
        refresh_token: state.refreshToken,
        id_token: jwt({ email: state.email }),
      }),
    });
  }

  function list(calendarId: string, q: URLSearchParams): Response {
    const all = [...calendarOf(calendarId).values()].sort((a, b) => a.seq - b.seq);
    const syncToken = q.get('syncToken');
    const uid = q.get('iCalUID');
    let items: Stored[];
    if (syncToken) {
      if (state.expireSyncTokens || !/^s\d+$/.test(syncToken)) return json({ error: { code: 410 } }, 410);
      items = all.filter((e) => e.seq > Number(syncToken.slice(1)));
    } else {
      const showDeleted = q.get('showDeleted') === 'true';
      // As on Google: cancelled occurrences of a series are listed even without showDeleted.
      items = all.filter((e) => showDeleted || e.status !== 'cancelled' || e.recurringEventId);
      if (uid) items = items.filter((e) => e.iCalUID === uid);
    }
    const start = Number(q.get('pageToken') ?? 0);
    const page = items.slice(start, start + state.pageSize);
    const more = start + state.pageSize < items.length;
    return json({
      timeZone: 'Europe/London',
      items: page.map(out),
      ...(more ? { nextPageToken: String(start + state.pageSize) } : uid ? {} : { nextSyncToken: `s${seq}` }),
    });
  }

  async function event(req: Request, calendarId: string, id: string | undefined): Promise<Response> {
    const c = calendarOf(calendarId);
    const body = req.method === 'POST' || req.method === 'PATCH' ? ((await req.json()) as GoogleEvent) : undefined;
    if (!id) {
      if (req.method !== 'POST' || !body) return json({ error: { code: 405 } }, 405);
      if (c.has(body.id))
        return json({ error: { code: 409, message: 'The requested identifier already exists.' } }, 409);
      return json(out(put(calendarId, body)));
    }
    let e = c.get(id);
    const ifMatch = req.headers.get('if-match');
    if (req.method === 'GET') return e ? json(out(e)) : json({ error: { code: 404 } }, 404);
    if (!e && req.method === 'PATCH') {
      // An occurrence of a series that hasn't been changed before.
      const [seriesId, when] = id.split('_');
      const series = seriesId ? c.get(seriesId) : undefined;
      if (!series?.recurrence || !when) return json({ error: { code: 404 } }, 404);
      const original =
        when.length === 8
          ? { date: `${when.slice(0, 4)}-${when.slice(4, 6)}-${when.slice(6)}` }
          : {
              dateTime: `${when.slice(0, 4)}-${when.slice(4, 6)}-${when.slice(6, 8)}T${when.slice(9, 11)}:${when.slice(11, 13)}:${when.slice(13, 15)}Z`,
            };
      e = { id, seq: 0, iCalUID: series.iCalUID, recurringEventId: seriesId, originalStartTime: original };
    }
    if (!e) return json({ error: { code: 404 } }, 404);
    if (req.method === 'DELETE' && e.status === 'cancelled') return json({ error: { code: 410 } }, 410);
    if (ifMatch && ifMatch !== e.etag) return json({ error: { code: 412, message: 'Precondition Failed' } }, 412);
    if (req.method === 'DELETE') {
      cancel(calendarId, id);
      return new Response(null, { status: 204 });
    }
    return json(out(put(calendarId, { ...e, ...body, id })));
  }

  const server = Bun.serve({
    port: 0,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      requests.push(`${req.method} ${url.pathname}${url.search}`);
      if (url.pathname === '/token') return token(new URLSearchParams(await req.text()));
      if (req.headers.get('authorization') !== `Bearer ${state.accessToken}`)
        return json({ error: { code: 401, message: 'Invalid Credentials' } }, 401);
      if (url.pathname === '/calendar/v3/users/me/calendarList') return json({ items: calendars });
      const m = /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(url.pathname);
      if (!m?.[1]) return json({ error: { code: 404 } }, 404);
      const calendarId = decodeURIComponent(m[1]);
      if (!m[2] && req.method === 'GET') return list(calendarId, url.searchParams);
      return event(req, calendarId, m[2] && decodeURIComponent(m[2]));
    },
  });
  const base = `http://127.0.0.1:${server.port}`;

  return {
    endpoints: { auth: `${base}/auth`, token: `${base}/token`, api: `${base}/calendar/v3` },
    calendars,
    events,
    requests,
    tokenRequests,
    put,
    cancel,
    get: (calendarId: string, id: string): Stored | undefined => calendarOf(calendarId).get(id),
    state,
    stop: (): void => {
      server.stop(true);
    },
  };
}
