// Google connections end to end against the fake Google in @homa/sync/testing: the OAuth start and
// callback (PKCE, state bound to the user), choosing calendars, pulls, pushes through the outbox,
// a 412 conflict, a calendar deleted on Google, invalid_grant, and another user's access. Skipped without TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { schema } from '@homa/db';
import { DEFAULT_FETCH_POLICY, googleEventId, parseCredentialKey } from '@homa/sync';
import { type FakeGoogle, fakeGoogle } from '@homa/sync/testing';
import { eq } from 'drizzle-orm';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';
import { pushDueOutboxes } from './sync-service';
import type { SyncSettings } from './sync-settings';

type CalendarJson = { id: string; name: string; color: string; readOnly: boolean; remoteMissing: boolean };
type ConnectionJson = {
  id: string;
  provider: string;
  label: string | null;
  status: string;
  lastError: string | null;
  notice: string | null;
  calendars: CalendarJson[];
};
type EventJson = { id: string; uid: string; summary: string; calendarId: string };

describe.skipIf(!testDatabaseUrl)('Google connections', () => {
  let g: FakeGoogle;
  let settings: SyncSettings;
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  let ada = '';
  let bob = '';
  let conn: ConnectionJson;
  let mine: CalendarJson;

  const req = (method: string, path: string, cookie: string, body?: unknown): Promise<Response> =>
    Promise.resolve(
      app.request(`/api${path}`, {
        method,
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  const json = async <T>(res: Response | Promise<Response>): Promise<T> => (await res).json() as Promise<T>;
  const signUp = async (email: string): Promise<string> => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'correct horse battery', name: 'x' }),
    });
    return res.headers.get('set-cookie')?.split(';')[0] ?? '';
  };
  /** Starts a connect as `session`: the state Google would get, and the flow cookie. */
  const start = async (session: string): Promise<{ state: string; challenge: string; flow: string }> => {
    const res = await req('GET', '/connections/google/start', session);
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location') ?? '');
    const flow = res.headers.get('set-cookie')?.split(';')[0] ?? '';
    return { state: to.searchParams.get('state') ?? '', challenge: to.searchParams.get('code_challenge') ?? '', flow };
  };
  const callback = (session: string, flow: string, query: Record<string, string>): Promise<Response> =>
    req(
      'GET',
      `/connections/google/callback?${new URLSearchParams(query)}`,
      [session, flow].filter(Boolean).join('; '),
    );
  const connections = (session: string): Promise<ConnectionJson[]> => json(req('GET', '/connections', session));
  const syncNow = (): Promise<ConnectionJson> => json<ConnectionJson>(req('POST', `/connections/${conn.id}/sync`, ada));
  const eventByUid = async (uid: string): Promise<typeof schema.events.$inferSelect | undefined> =>
    (await t.db.select().from(schema.events).where(eq(schema.events.uid, uid)))[0];

  beforeAll(async () => {
    g = fakeGoogle();
    g.calendars.push(
      { id: 'ada@example.com', summary: 'Ada', accessRole: 'owner', backgroundColor: '#9fc6e7' },
      { id: 'holidays@group.v.calendar.google.com', summary: 'Holidays', accessRole: 'reader' },
    );
    g.put('ada@example.com', {
      id: 'standup',
      iCalUID: 'standup@google.com',
      summary: 'Stand-up',
      start: { dateTime: '2027-03-01T09:00:00Z', timeZone: 'Europe/London' },
      end: { dateTime: '2027-03-01T09:15:00Z', timeZone: 'Europe/London' },
      recurrence: ['RRULE:FREQ=WEEKLY;COUNT=3'],
    });
    g.put('holidays@group.v.calendar.google.com', {
      id: 'h1',
      summary: 'Bank holiday',
      start: { date: '2027-03-29' },
      end: { date: '2027-03-30' },
    });
    settings = {
      key: parseCredentialKey(randomBytes(32).toString('base64')),
      intervalMinutes: 30,
      policy: DEFAULT_FETCH_POLICY,
      google: {
        clientId: 'cid',
        clientSecret: 'secret',
        redirectUri: 'http://localhost:3000/api/connections/google/callback',
        endpoints: g.endpoints,
      },
    };
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db), sync: settings });
    ada = await signUp('ada@example.com');
    bob = await signUp('bob@example.com');
  });
  afterAll(async () => {
    g?.stop();
    await t?.drop();
  });

  test('without the OAuth client, Google is off: the instance says so and start answers 503', async () => {
    const off = createApp({ db: t.db, auth: testAuth(t.db), sync: { ...settings, google: undefined } });
    expect(await json<{ googleCalendar: boolean }>(off.request('/api/instance'))).toMatchObject({
      googleCalendar: false,
    });
    const res = await off.request('/api/connections/google/start', { headers: { cookie: ada } });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain('HOMA_GOOGLE_CLIENT_ID');
    expect(await json<{ googleCalendar: boolean }>(req('GET', '/instance', ''))).toMatchObject({
      googleCalendar: true,
    });
  });

  test('start needs a session and redirects to Google with PKCE, offline access and a state cookie', async () => {
    expect((await req('GET', '/connections/google/start', '')).status).toBe(401);
    const res = await req('GET', '/connections/google/start', ada);
    const to = new URL(res.headers.get('location') ?? '');
    expect(to.href).toStartWith(g.endpoints.auth);
    expect(Object.fromEntries(to.searchParams)).toMatchObject({
      client_id: 'cid',
      redirect_uri: 'http://localhost:3000/api/connections/google/callback',
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      code_challenge_method: 'S256',
      scope: 'openid email https://www.googleapis.com/auth/calendar',
    });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('homa_google_oauth=');
    expect(cookie).toContain('Path=/api/connections/google');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  test('a callback without the flow cookie, with the wrong state, or for another user is refused', async () => {
    const { state, flow } = await start(ada);
    const refused = async (res: Response): Promise<void> => {
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/settings?googleError=state');
    };
    await refused(await callback(ada, '', { code: 'good-code', state }));
    await refused(await callback(ada, flow, { code: 'good-code', state: `${state}x` }));
    // Bob finishing Ada's flow (her cookie and state): the cookie is bound to Ada.
    await refused(await callback(bob, flow, { code: 'good-code', state }));
    expect(await connections(ada)).toEqual([]);
    expect(await connections(bob)).toEqual([]);
    expect(g.tokenRequests).toEqual([]);
    // Without a session at all.
    expect((await callback('', flow, { code: 'good-code', state })).status).toBe(401);
  });

  test('a denied consent or a refused code saves nothing', async () => {
    const { state, flow } = await start(ada);
    const denied = await callback(ada, flow, { error: 'access_denied', state });
    expect(denied.headers.get('location')).toBe('/settings?googleError=denied');
    const bad = await callback(ada, flow, { code: 'bad-code', state });
    expect(bad.headers.get('location')).toBe('/settings?googleError=failed');
    expect(await connections(ada)).toEqual([]);
  });

  test('a good callback saves the account (tokens encrypted) and sends the user to choose calendars', async () => {
    const { state, challenge, flow } = await start(ada);
    const res = await callback(ada, flow, { code: 'good-code', state, scope: 'email' });
    const location = res.headers.get('location') ?? '';
    expect(location).toMatch(/^\/settings\?google=[0-9a-f-]{36}$/);
    // The flow cookie is cleared.
    expect(res.headers.get('set-cookie')).toContain('homa_google_oauth=;');
    const sent = g.tokenRequests.at(-1);
    expect(sent?.get('grant_type')).toBe('authorization_code');
    expect(
      createHash('sha256')
        .update(sent?.get('code_verifier') ?? '')
        .digest('base64url'),
    ).toBe(challenge);
    expect(sent?.get('redirect_uri')).toBe('http://localhost:3000/api/connections/google/callback');

    [conn] = (await connections(ada)) as [ConnectionJson];
    expect(conn).toMatchObject({ provider: 'google', label: 'ada@example.com', calendars: [] });
    expect(location).toBe(`/settings?google=${conn.id}`);
    const [row] = await t.db.select().from(schema.connections).where(eq(schema.connections.id, conn.id));
    expect(row?.credentials).not.toContain(g.state.accessToken);
    expect(row?.credentials).not.toContain('rt-0');
  });

  test('choosing calendars pulls them; a reader calendar is read-only', async () => {
    const remote = await json<{ remoteId: string; readOnly: boolean; selected: boolean }[]>(
      req('GET', `/connections/${conn.id}/remote-calendars`, ada),
    );
    expect(remote).toEqual([
      {
        remoteId: 'ada@example.com',
        name: 'Ada',
        color: '#9fc6e7',
        readOnly: false,
        selected: false,
        missing: false,
      },
      {
        remoteId: 'holidays@group.v.calendar.google.com',
        name: 'Holidays',
        color: null,
        readOnly: true,
        selected: false,
        missing: false,
      },
    ] as never);
    conn = await json<ConnectionJson>(
      req('PUT', `/connections/${conn.id}/calendars`, ada, { remoteIds: remote.map((r) => r.remoteId) }),
    );
    expect(conn).toMatchObject({ status: 'ok', lastError: null });
    mine = conn.calendars.find((c) => c.name === 'Ada') as CalendarJson;
    expect(mine).toMatchObject({ readOnly: false, color: '#9fc6e7' });
    const holidays = conn.calendars.find((c) => c.name === 'Holidays') as CalendarJson;
    expect(holidays.readOnly).toBe(true);
    expect(await eventByUid('standup@google.com')).toMatchObject({
      tz: 'Europe/London',
      rrule: 'FREQ=WEEKLY;COUNT=3',
      remoteHref: `${g.endpoints.api}/calendars/ada%40example.com/events/standup`,
    });
    expect(await eventByUid('h1@google.com')).toMatchObject({ allDay: true });
    const calendars = await t.db.select().from(schema.calendars).where(eq(schema.calendars.id, mine.id));
    expect(calendars[0]?.syncToken).toMatch(/^s\d+$/);
  });

  test('local creates, edits and deletes are pushed; our own uploads come back unchanged', async () => {
    const created = await json<EventJson>(
      req('POST', '/events', ada, {
        calendarId: mine.id,
        summary: 'Lunch',
        start: '2027-03-12T12:00:00Z',
        end: '2027-03-12T13:00:00Z',
        tz: 'Europe/London',
      }),
    );
    expect(await pushDueOutboxes(t.db, settings)).toEqual({ connections: 1, busy: 0, failed: 0 });
    const id = googleEventId(created.uid);
    expect(g.get('ada@example.com', id)).toMatchObject({
      summary: 'Lunch',
      extendedProperties: { private: { homaUid: created.uid } },
    });
    expect((await eventByUid(created.uid))?.remoteEtag).toBe(g.get('ada@example.com', id)?.etag ?? 'missing');

    await req('PATCH', `/events/${created.id}`, ada, { summary: 'Team lunch' });
    expect(await syncNow()).toMatchObject({ status: 'ok', notice: null });
    expect(g.get('ada@example.com', id)?.summary).toBe('Team lunch');
    // The pull reads Homa's UID back, so the event isn't duplicated under Google's own iCalUID.
    expect((await eventByUid(created.uid))?.summary).toBe('Team lunch');
    expect(await eventByUid(`${id}@google.com`)).toBeUndefined();

    expect((await req('DELETE', `/events/${created.id}`, ada)).status).toBe(204);
    expect(await pushDueOutboxes(t.db, settings)).toMatchObject({ connections: 1 });
    expect(g.get('ada@example.com', id)?.status).toBe('cancelled');
    expect(await syncNow()).toMatchObject({ status: 'ok', notice: null });
  });

  test("a conflict (412) keeps Google's copy and leaves a notice", async () => {
    const local = await eventByUid('standup@google.com');
    // Changed on Google after the last pull, and locally before the next one.
    const before = g.get('ada@example.com', 'standup');
    if (before) g.put('ada@example.com', { ...before, summary: 'Stand-up (Google)' });
    await req('PATCH', `/events/${local?.id}`, ada, { summary: 'Stand-up (mine)' });
    const after = await syncNow();
    expect(after.notice).toContain('"Stand-up (mine)" conflicted with a change on the server');
    expect((await eventByUid('standup@google.com'))?.summary).toBe('Stand-up (Google)');
    expect(g.get('ada@example.com', 'standup')?.summary).toBe('Stand-up (Google)');
  });

  test('a calendar deleted on Google is marked, not a failure; it can be removed only while missing', async () => {
    const ttrpg = 'ttrpg@group.calendar.google.com';
    g.calendars.push({ id: ttrpg, summary: 'TTRPG', accessRole: 'owner' });
    g.put(ttrpg, { id: 'session', summary: 'Session 12', start: { date: '2027-03-06' }, end: { date: '2027-03-07' } });
    const ids = ['ada@example.com', 'holidays@group.v.calendar.google.com', ttrpg];
    conn = await json<ConnectionJson>(req('PUT', `/connections/${conn.id}/calendars`, ada, { remoteIds: ids }));
    const gone = conn.calendars.find((c) => c.name === 'TTRPG') as CalendarJson;
    expect(gone.remoteMissing).toBe(false);
    expect(await eventByUid('session@google.com')).toBeDefined();

    // Deleted on Google: the calendar list drops it and its events listing answers 404.
    g.calendars.splice(
      g.calendars.findIndex((c) => c.id === ttrpg),
      1,
    );
    g.state.missingCalendars.add(ttrpg);
    const synced = await syncNow();
    expect(synced).toMatchObject({ status: 'ok', lastError: null });
    expect(synced.calendars.map((c) => [c.name, c.remoteMissing])).toEqual([
      ['Ada', false],
      ['Holidays', false],
      ['TTRPG', true],
    ]);
    // The picker still lists it, marked missing; saving the same choice keeps it.
    const remote = await json<{ remoteId: string; missing: boolean; selected: boolean }[]>(
      req('GET', `/connections/${conn.id}/remote-calendars`, ada),
    );
    expect(remote.find((r) => r.remoteId === ttrpg)).toMatchObject({ missing: true, selected: true, name: 'TTRPG' });
    expect((await req('PUT', `/connections/${conn.id}/calendars`, ada, { remoteIds: ids })).status).toBe(200);

    // Back on Google: the mark clears.
    g.state.missingCalendars.delete(ttrpg);
    expect((await syncNow()).calendars.find((c) => c.id === gone.id)?.remoteMissing).toBe(false);
    expect((await req('DELETE', `/calendars/${gone.id}`, ada)).status).toBe(400);
    expect((await req('DELETE', `/calendars/${mine.id}`, ada)).status).toBe(400);

    // Gone again: only the owner can delete it, and its events and outbox go with it.
    g.state.missingCalendars.add(ttrpg);
    await syncNow();
    const local = await json<EventJson>(
      req('POST', '/events', ada, {
        calendarId: gone.id,
        summary: 'Prep',
        start: '2027-03-05T18:00:00Z',
        end: '2027-03-05T19:00:00Z',
        tz: 'UTC',
      }),
    );
    expect(await t.db.select().from(schema.outbox).where(eq(schema.outbox.calendarId, gone.id))).toHaveLength(1);
    expect((await req('DELETE', `/calendars/${gone.id}`, bob)).status).toBe(404);
    expect((await req('DELETE', `/calendars/${gone.id}`, ada)).status).toBe(204);
    expect(await eventByUid('session@google.com')).toBeUndefined();
    expect(await eventByUid(local.uid)).toBeUndefined();
    expect(await t.db.select().from(schema.outbox).where(eq(schema.outbox.calendarId, gone.id))).toEqual([]);
    expect(
      await t.db.select().from(schema.eventInstances).where(eq(schema.eventInstances.calendarId, gone.id)),
    ).toEqual([]);
    const after = await syncNow();
    expect(after).toMatchObject({ status: 'ok' });
    expect(after.calendars.map((c) => c.name)).toEqual(['Ada', 'Holidays']);
    g.state.missingCalendars.clear();
  });

  test('refreshed tokens are stored; a revoked grant puts the connection in error with what to do', async () => {
    const [row] = await t.db.select().from(schema.connections).where(eq(schema.connections.id, conn.id));
    // Google expires the access token: the next sync refreshes it (401, refresh, retry).
    g.state.accessToken = 'rotated-on-google';
    expect(await syncNow()).toMatchObject({ status: 'ok' });
    const [after] = await t.db.select().from(schema.connections).where(eq(schema.connections.id, conn.id));
    expect(after?.credentials).not.toBe(row?.credentials);

    g.state.revoked = true;
    g.state.accessToken = 'expired-again';
    const failed = await syncNow();
    expect(failed.status).toBe('error');
    expect(failed.lastError).toContain('connect Google again');
    g.state.revoked = false;
  });

  test("another user can't see, change or sync the connection", async () => {
    expect((await connections(bob)).map((c) => c.id)).not.toContain(conn.id);
    expect((await req('GET', `/connections/${conn.id}/remote-calendars`, bob)).status).toBe(404);
    expect((await req('PUT', `/connections/${conn.id}/calendars`, bob, { remoteIds: [] })).status).toBe(404);
    expect((await req('POST', `/connections/${conn.id}/sync`, bob)).status).toBe(404);
    expect((await req('DELETE', `/connections/${conn.id}`, bob)).status).toBe(404);
    const local = await eventByUid('standup@google.com');
    expect((await req('PATCH', `/events/${local?.id}`, bob, { summary: 'x' })).status).toBe(404);
  });

  test('removing the connection leaves Google alone', async () => {
    expect((await req('DELETE', `/connections/${conn.id}`, ada)).status).toBe(204);
    expect(g.get('ada@example.com', 'standup')?.status).toBe('confirmed');
  });
});
