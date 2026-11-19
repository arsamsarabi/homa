import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { schema } from '@homa/db';
import { DEFAULT_FETCH_POLICY, parseCredentialKey } from '@homa/sync';
import { eq } from 'drizzle-orm';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';
import { syncConnection, syncDueConnections } from './sync-service';
import type { SyncSettings } from './sync-settings';

type Json = Record<string, unknown>;
type ConnectionJson = {
  id: string;
  status: string;
  lastError: string | null;
  lastSyncedAt: string | null;
  calendars: { id: string; name: string; color: string; readOnly: boolean; connectionId: string }[];
};

const event = (uid: string, summary: string, day: string): string[] => [
  'BEGIN:VEVENT',
  `UID:${uid}`,
  `SUMMARY:${summary}`,
  `DTSTART;VALUE=DATE:${day}`,
  'END:VEVENT',
];
const feed = (...events: string[][]): string =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Bank holidays', ...events.flat(), 'END:VCALENDAR'].join('\r\n');

// The feed server. Loopback is reachable only because these settings allow private networks.
let body = feed(event('a@x', 'Spring holiday', '20270503'), event('b@x', 'Summer holiday', '20270830'));
let status = 200;
let hits = 0;
let server: ReturnType<typeof Bun.serve>;
const feedUrl = (token = 'secret-token'): string => `http://127.0.0.1:${server.port}/private/${token}/basic.ics`;

const settings: SyncSettings = {
  key: parseCredentialKey(randomBytes(32).toString('base64')),
  intervalMinutes: 30,
  policy: { ...DEFAULT_FETCH_POLICY, allowPrivate: true, timeoutMs: 5_000 },
};

describe.skipIf(!testDatabaseUrl)('connected calendars', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  let ada = '';
  let bob = '';
  let sub: ConnectionJson;

  const req = (method: string, path: string, cookie: string, body?: unknown): Promise<Response> =>
    Promise.resolve(
      app.request(`/api${path}`, {
        method,
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  const signUp = async (email: string): Promise<string> => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'correct horse battery', name: 'x' }),
    });
    return res.headers.get('set-cookie')?.split(';')[0] ?? '';
  };
  const summaries = async (cookie = ada): Promise<string[]> =>
    (
      (await (await req('GET', '/occurrences?from=2027-01-01T00:00:00Z&to=2027-12-31T00:00:00Z', cookie)).json()) as {
        summary: string;
      }[]
    ).map((o) => o.summary);
  const connections = async (cookie = ada): Promise<ConnectionJson[]> =>
    (await (await req('GET', '/connections', cookie)).json()) as ConnectionJson[];

  beforeAll(async () => {
    server = Bun.serve({
      port: 0,
      fetch: (r) => {
        hits++;
        if (status !== 200) return new Response('down', { status });
        if (r.headers.get('if-none-match') === '"same"' && body.includes('same-etag'))
          return new Response(null, { status: 304 });
        return new Response(body, { headers: body.includes('same-etag') ? { etag: '"same"' } : {} });
      },
    });
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db), sync: settings });
    ada = await signUp('ada@example.com');
    bob = await signUp('bob@example.com');
  });
  afterAll(async () => {
    server.stop(true);
    await t.drop();
  });

  test('subscribing fetches the feed into a new read-only calendar and stores the URL encrypted', async () => {
    const res = await req('POST', '/connections/ics', ada, { url: feedUrl(), color: '#336699' });
    expect(res.status).toBe(201);
    sub = (await res.json()) as ConnectionJson;
    expect(sub).toMatchObject({ status: 'ok', lastError: null });
    expect(sub.calendars).toEqual([
      expect.objectContaining({ name: 'Bank holidays', color: '#336699', readOnly: true, connectionId: sub.id }),
    ]);
    expect(JSON.stringify(sub)).not.toContain('secret-token');
    expect(await summaries()).toEqual(['Spring holiday', 'Summer holiday']);
    const [row] = await t.db.select().from(schema.connections).where(eq(schema.connections.id, sub.id));
    expect(row?.credentials).toStartWith('v1.');
    expect(row?.credentials).not.toContain('secret-token');
    // Listed in the calendars too, read-only.
    const calendars = (await (await req('GET', '/calendars', ada)).json()) as Json[];
    expect(calendars.find((c) => c.id === sub.calendars[0]?.id)).toMatchObject({ readOnly: true });
  });

  test("a subscription's events can't be created, changed, deleted or imported into", async () => {
    const calendarId = sub.calendars[0]?.id ?? '';
    const create = await req('POST', '/events', ada, {
      calendarId,
      summary: 'Mine',
      start: '2027-05-03T09:00:00Z',
      end: '2027-05-03T10:00:00Z',
      tz: 'UTC',
    });
    expect(create.status).toBe(403);
    expect(await create.json()).toEqual({ error: 'This calendar is read-only' });
    const [e] = await t.db.select().from(schema.events).where(eq(schema.events.calendarId, calendarId));
    const id = e?.id ?? '';
    expect((await req('PATCH', `/events/${id}`, ada, { summary: 'x' })).status).toBe(403);
    expect((await req('DELETE', `/events/${id}`, ada)).status).toBe(403);
    // Moving a native event into it is refused too.
    const native = String(((await (await req('GET', '/calendars', ada)).json()) as Json[])[0]?.id);
    const mine = (await (
      await req('POST', '/events', ada, {
        calendarId: native,
        summary: 'Mine',
        start: '2027-06-01T09:00:00Z',
        end: '2027-06-01T10:00:00Z',
        tz: 'UTC',
      })
    ).json()) as Json;
    expect((await req('PATCH', `/events/${mine.id}`, ada, { calendarId })).status).toBe(403);
    const imported = await app.request(`/api/calendars/${calendarId}/import`, {
      method: 'POST',
      headers: { 'content-type': 'text/calendar', origin: 'http://localhost:3000', cookie: ada },
      body: feed(),
    });
    expect(imported.status).toBe(403);
    // Renaming and recoloring are fine; deleting the calendar alone is not.
    const renamed = await req('PATCH', `/calendars/${calendarId}`, ada, { name: 'UK holidays' });
    expect(await renamed.json()).toMatchObject({ name: 'UK holidays', readOnly: true });
    expect((await req('DELETE', `/calendars/${calendarId}`, ada)).status).toBe(400);
  });

  test('sync now applies changes and removals; an unchanged feed is skipped', async () => {
    body = feed(event('a@x', 'Spring bank holiday', '20270503'), event('c@x', 'Boxing Day', '20271227'));
    const res = await req('POST', `/connections/${sub.id}/sync`, ada);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', lastError: null });
    expect(await summaries()).toEqual(['Spring bank holiday', 'Mine', 'Boxing Day']);
    // The rename stuck: syncs don't overwrite the calendar's name.
    expect((await connections())[0]?.calendars[0]?.name).toBe('UK holidays');

    const before = await t.db.select().from(schema.events).where(eq(schema.events.uid, 'a@x'));
    expect(await syncConnection(t.db, settings, sub.id)).toBe('unchanged');
    const after = await t.db.select().from(schema.events).where(eq(schema.events.uid, 'a@x'));
    expect(after[0]?.updatedAt).toEqual(before[0]?.updatedAt as Date);
  });

  test('a conditional GET that answers 304 is unchanged', async () => {
    body = feed(event('a@x', 'Spring bank holiday', '20270503'), ['X-NOTE:same-etag']);
    expect(await syncConnection(t.db, settings, sub.id)).toBe('changed');
    expect(await syncConnection(t.db, settings, sub.id)).toBe('unchanged');
    expect(await summaries()).toEqual(['Spring bank holiday', 'Mine']);
  });

  test('a failing feed is recorded on the connection and does not stop the scheduled run', async () => {
    const other = (await (
      await req('POST', '/connections/ics', bob, { url: feedUrl('bob') })
    ).json()) as ConnectionJson;
    status = 500;
    const counts = await syncDueConnections(t.db, settings, new Date(Date.now() + 31 * 60_000));
    expect(counts).toEqual({ changed: 0, unchanged: 0, failed: 2, busy: 0 });
    expect((await connections())[0]).toMatchObject({ status: 'error', lastError: "The feed's server answered 500" });
    expect((await connections(bob))[0]?.id).toBe(other.id);
    // Not due again until the interval has passed.
    hits = 0;
    expect(await syncDueConnections(t.db, settings)).toEqual({ changed: 0, unchanged: 0, failed: 0, busy: 0 });
    expect(hits).toBe(0);
    status = 200;
    // Events stay as they were while the feed is down.
    expect(await summaries()).toEqual(['Spring bank holiday', 'Mine']);
  });

  test("you can't see, sync or remove someone else's connection", async () => {
    expect((await connections(bob)).map((c) => c.id)).not.toContain(sub.id);
    expect((await req('POST', `/connections/${sub.id}/sync`, bob)).status).toBe(404);
    expect((await req('DELETE', `/connections/${sub.id}`, bob)).status).toBe(404);
    expect((await req('GET', '/connections', '')).status).toBe(401);
    // Bob sees only his own subscription's copy, not Ada's events.
    expect(await summaries(bob)).toEqual(['Spring bank holiday']);
  });

  test('bad URLs, private networks (by default) and unknown holiday ids are 400s', async () => {
    const bad = await req('POST', '/connections/ics', ada, { url: 'file:///etc/passwd' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({
      error: "Couldn't subscribe: Only http and https addresses can be subscribed to",
    });
    const strict = createApp({
      db: t.db,
      auth: testAuth(t.db),
      sync: { ...settings, policy: DEFAULT_FETCH_POLICY },
    });
    const local = await strict.request('/api/connections/ics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie: ada },
      body: JSON.stringify({ url: feedUrl() }),
    });
    expect(local.status).toBe(400);
    expect(await local.json()).toEqual({
      error: "Couldn't subscribe: Feeds on private or local networks are not allowed on this server",
    });
    expect((await req('POST', '/connections/ics', ada, { holidayId: 'xx' })).status).toBe(400);
    expect(((await (await req('GET', '/holiday-calendars', ada)).json()) as Json[]).map((h) => h.id)).toContain(
      'gb-eaw',
    );
  });

  test('without HOMA_ENCRYPTION_KEY, subscribing is a 503 that says why', async () => {
    const keyless = createApp({ db: t.db, auth: testAuth(t.db) });
    const res = await keyless.request('/api/connections/ics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie: ada },
      body: JSON.stringify({ url: feedUrl() }),
    });
    expect(res.status).toBe(503);
    expect(String(((await res.json()) as Json).error)).toContain('HOMA_ENCRYPTION_KEY');
  });

  test('removing a connection removes its calendar and events', async () => {
    expect((await req('DELETE', `/connections/${sub.id}`, ada)).status).toBe(204);
    expect(await connections()).toEqual([]);
    expect(await summaries()).toEqual(['Mine']);
    expect(await t.db.select().from(schema.calendars).where(eq(schema.calendars.connectionId, sub.id))).toEqual([]);
    expect((await req('DELETE', `/connections/${sub.id}`, ada)).status).toBe(404);
  });
});
