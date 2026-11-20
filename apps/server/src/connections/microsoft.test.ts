// Microsoft connections end to end against the fake Graph in @homa/sync/testing: the OAuth start and
// callback (PKCE, state bound to the user and the provider), choosing calendars, pulls, pushes
// through the outbox (creates get Graph's id as their href), a conflict, a calendar deleted in
// Outlook, rotated refresh tokens, invalid_grant, and another user's access. Skipped without TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { schema } from '@homa/db';
import { DEFAULT_FETCH_POLICY, HOMA_UID_PROPERTY, parseCredentialKey } from '@homa/sync';
import { type FakeMicrosoft, fakeMicrosoft } from '@homa/sync/testing';
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

describe.skipIf(!testDatabaseUrl)('Microsoft connections', () => {
  let g: FakeMicrosoft;
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
  const start = async (session: string): Promise<{ state: string; challenge: string; flow: string }> => {
    const res = await req('GET', '/connections/microsoft/start', session);
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location') ?? '');
    const flow = res.headers.get('set-cookie')?.split(';')[0] ?? '';
    return { state: to.searchParams.get('state') ?? '', challenge: to.searchParams.get('code_challenge') ?? '', flow };
  };
  const callback = (session: string, flow: string, query: Record<string, string>): Promise<Response> =>
    req(
      'GET',
      `/connections/microsoft/callback?${new URLSearchParams(query)}`,
      [session, flow].filter(Boolean).join('; '),
    );
  const connections = (session: string): Promise<ConnectionJson[]> => json(req('GET', '/connections', session));
  const syncNow = (): Promise<ConnectionJson> => json<ConnectionJson>(req('POST', `/connections/${conn.id}/sync`, ada));
  const eventByUid = async (uid: string): Promise<typeof schema.events.$inferSelect | undefined> =>
    (await t.db.select().from(schema.events).where(eq(schema.events.uid, uid)))[0];
  const href = (calendarId: string, id: string): string => `${g.endpoints.api}/me/calendars/${calendarId}/events/${id}`;

  beforeAll(async () => {
    g = fakeMicrosoft();
    g.calendars.push(
      { id: 'cal-ada', name: 'Calendar', canEdit: true, hexColor: '#E3008C' },
      { id: 'cal-birthdays', name: 'Birthdays', canEdit: false },
    );
    g.put('cal-ada', {
      id: 'standup',
      subject: 'Stand-up',
      start: { dateTime: '2027-03-01T09:00:00', timeZone: 'GMT Standard Time' },
      end: { dateTime: '2027-03-01T09:15:00', timeZone: 'GMT Standard Time' },
      recurrence: {
        pattern: { type: 'weekly', interval: 1, daysOfWeek: ['monday'], firstDayOfWeek: 'monday' },
        range: { type: 'numbered', startDate: '2027-03-01', numberOfOccurrences: 3 },
      },
    });
    g.put('cal-birthdays', {
      id: 'b1',
      subject: "Bob's birthday",
      isAllDay: true,
      start: { dateTime: '2027-03-29T00:00:00', timeZone: 'UTC' },
      end: { dateTime: '2027-03-30T00:00:00', timeZone: 'UTC' },
    });
    settings = {
      key: parseCredentialKey(randomBytes(32).toString('base64')),
      intervalMinutes: 30,
      policy: DEFAULT_FETCH_POLICY,
      microsoft: {
        clientId: 'cid',
        clientSecret: 'secret',
        redirectUri: 'http://localhost:3000/api/connections/microsoft/callback',
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

  test('without the app, Microsoft is off: the instance says so and start answers 503', async () => {
    const off = createApp({ db: t.db, auth: testAuth(t.db), sync: { ...settings, microsoft: undefined } });
    expect(await json(off.request('/api/instance'))).toMatchObject({ microsoftCalendar: false });
    const res = await off.request('/api/connections/microsoft/start', { headers: { cookie: ada } });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain('HOMA_MICROSOFT_CLIENT_ID');
    expect(await json(req('GET', '/instance', ''))).toMatchObject({ microsoftCalendar: true, googleCalendar: false });
  });

  test('start needs a session and redirects to Microsoft with PKCE, the scopes and a state cookie', async () => {
    expect((await req('GET', '/connections/microsoft/start', '')).status).toBe(401);
    const res = await req('GET', '/connections/microsoft/start', ada);
    const to = new URL(res.headers.get('location') ?? '');
    expect(to.href).toStartWith(g.endpoints.auth);
    expect(Object.fromEntries(to.searchParams)).toMatchObject({
      client_id: 'cid',
      redirect_uri: 'http://localhost:3000/api/connections/microsoft/callback',
      response_type: 'code',
      code_challenge_method: 'S256',
      scope: 'offline_access openid email User.Read Calendars.ReadWrite',
    });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('homa_microsoft_oauth=');
    expect(cookie).toContain('Path=/api/connections/microsoft');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  test("a callback without the cookie, with the wrong state, for another user or with Google's cookie is refused", async () => {
    const { state, flow } = await start(ada);
    const refused = async (res: Response): Promise<void> => {
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/settings?microsoftError=state');
    };
    await refused(await callback(ada, '', { code: 'good-code', state }));
    await refused(await callback(ada, flow, { code: 'good-code', state: `${state}x` }));
    await refused(await callback(bob, flow, { code: 'good-code', state }));
    // The same flow cookie presented as Google's is bound to Microsoft, so it doesn't decrypt.
    const googleApp = createApp({
      db: t.db,
      auth: testAuth(t.db),
      sync: { ...settings, google: { ...(settings.microsoft as NonNullable<SyncSettings['microsoft']>) } },
    });
    const asGoogle = await googleApp.request(
      `/api/connections/google/callback?${new URLSearchParams({ code: 'good-code', state })}`,
      { headers: { cookie: `${ada}; ${flow.replace('homa_microsoft_oauth', 'homa_google_oauth')}` } },
    );
    expect(asGoogle.headers.get('location')).toBe('/settings?googleError=state');
    expect(await connections(ada)).toEqual([]);
    expect(g.tokenRequests).toEqual([]);
    expect((await callback('', flow, { code: 'good-code', state })).status).toBe(401);
  });

  test('a denied consent or a refused code saves nothing', async () => {
    const { state, flow } = await start(ada);
    const denied = await callback(ada, flow, { error: 'access_denied', state });
    expect(denied.headers.get('location')).toBe('/settings?microsoftError=denied');
    const bad = await callback(ada, flow, { code: 'bad-code', state });
    expect(bad.headers.get('location')).toBe('/settings?microsoftError=failed');
    expect(await connections(ada)).toEqual([]);
  });

  test('a good callback saves the account (tokens encrypted), labeled with its address', async () => {
    const { state, challenge, flow } = await start(ada);
    const res = await callback(ada, flow, { code: 'good-code', state });
    const location = res.headers.get('location') ?? '';
    expect(location).toMatch(/^\/settings\?microsoft=[0-9a-f-]{36}$/);
    expect(res.headers.get('set-cookie')).toContain('homa_microsoft_oauth=;');
    const sent = g.tokenRequests.at(-1);
    expect(sent?.get('grant_type')).toBe('authorization_code');
    expect(
      createHash('sha256')
        .update(sent?.get('code_verifier') ?? '')
        .digest('base64url'),
    ).toBe(challenge);
    [conn] = (await connections(ada)) as [ConnectionJson];
    expect(conn).toMatchObject({ provider: 'microsoft', label: 'ada@outlook.com', calendars: [] });
    const [row] = await t.db.select().from(schema.connections).where(eq(schema.connections.id, conn.id));
    expect(row?.credentials).not.toContain(g.state.accessToken);
    expect(row?.credentials).not.toContain(g.state.refreshToken);
  });

  test('choosing calendars pulls them; a calendar the account can only read is read-only', async () => {
    const remote = await json<{ remoteId: string }[]>(req('GET', `/connections/${conn.id}/remote-calendars`, ada));
    expect(remote).toEqual([
      { remoteId: 'cal-ada', name: 'Calendar', color: '#e3008c', readOnly: false, selected: false, missing: false },
      { remoteId: 'cal-birthdays', name: 'Birthdays', color: null, readOnly: true, selected: false, missing: false },
    ] as never);
    conn = await json<ConnectionJson>(
      req('PUT', `/connections/${conn.id}/calendars`, ada, { remoteIds: remote.map((r) => r.remoteId) }),
    );
    expect(conn).toMatchObject({ status: 'ok', lastError: null });
    mine = conn.calendars.find((c) => c.name === 'Calendar') as CalendarJson;
    expect(mine).toMatchObject({ readOnly: false, color: '#e3008c' });
    expect(conn.calendars.find((c) => c.name === 'Birthdays')?.readOnly).toBe(true);
    const standupUid = g.get('standup')?.iCalUId ?? '';
    expect(await eventByUid(standupUid)).toMatchObject({
      tz: 'Europe/London',
      rrule: 'FREQ=WEEKLY;COUNT=3;BYDAY=MO',
      remoteHref: href('cal-ada', 'standup'),
      remoteEtag: g.get('standup')?.changeKey ?? 'missing',
    });
    expect(await eventByUid(g.get('b1')?.iCalUId ?? '')).toMatchObject({ allDay: true });
  });

  test("local creates, edits and deletes are pushed; the create's href is Graph's id", async () => {
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
    const remote = [...g.events.values()].find((e) => e.subject === 'Lunch');
    expect(remote?.props).toEqual([{ id: HOMA_UID_PROPERTY, value: created.uid }]);
    const local = await eventByUid(created.uid);
    expect(local).toMatchObject({ remoteHref: href('cal-ada', remote?.id ?? ''), remoteEtag: remote?.changeKey ?? '' });

    await req('PATCH', `/events/${created.id}`, ada, { summary: 'Team lunch' });
    expect(await syncNow()).toMatchObject({ status: 'ok', notice: null });
    expect(g.get(remote?.id ?? '')?.subject).toBe('Team lunch');
    // Read back by Homa's UID, so the event isn't duplicated under Graph's iCalUId.
    expect((await eventByUid(created.uid))?.summary).toBe('Team lunch');
    expect(await eventByUid(remote?.iCalUId ?? '')).toBeUndefined();

    expect((await req('DELETE', `/events/${created.id}`, ada)).status).toBe(204);
    expect(await pushDueOutboxes(t.db, settings)).toMatchObject({ connections: 1 });
    expect(g.get(remote?.id ?? '')).toBeUndefined();
    expect(await syncNow()).toMatchObject({ status: 'ok', notice: null });
  });

  test("a conflict keeps Outlook's copy and leaves a notice", async () => {
    const uid = g.get('standup')?.iCalUId ?? '';
    const local = await eventByUid(uid);
    g.update('standup', { subject: 'Stand-up (Outlook)' });
    await req('PATCH', `/events/${local?.id}`, ada, { summary: 'Stand-up (mine)' });
    const after = await syncNow();
    expect(after.notice).toContain('"Stand-up (mine)" conflicted with a change on the server');
    expect((await eventByUid(uid))?.summary).toBe('Stand-up (Outlook)');
    expect(g.get('standup')?.subject).toBe('Stand-up (Outlook)');
  });

  test('a calendar deleted in Outlook is marked, not a failure, and clears when it comes back', async () => {
    g.calendars.push({ id: 'cal-club', name: 'Club', canEdit: true });
    const ids = ['cal-ada', 'cal-birthdays', 'cal-club'];
    conn = await json<ConnectionJson>(req('PUT', `/connections/${conn.id}/calendars`, ada, { remoteIds: ids }));
    g.calendars.pop();
    g.state.missingCalendars.add('cal-club');
    const synced = await syncNow();
    expect(synced).toMatchObject({ status: 'ok', lastError: null });
    expect(synced.calendars.map((c) => [c.name, c.remoteMissing])).toEqual([
      ['Calendar', false],
      ['Birthdays', false],
      ['Club', true],
    ]);
    g.state.missingCalendars.delete('cal-club');
    expect((await syncNow()).calendars.find((c) => c.name === 'Club')?.remoteMissing).toBe(false);
  });

  test('a rotated refresh token is stored; a revoked grant puts the connection in error', async () => {
    const [row] = await t.db.select().from(schema.connections).where(eq(schema.connections.id, conn.id));
    const rotatedFrom = g.state.refreshToken;
    g.state.accessToken = 'expired-in-microsoft';
    expect(await syncNow()).toMatchObject({ status: 'ok' });
    expect(g.state.refreshToken).not.toBe(rotatedFrom);
    expect(g.tokenRequests.at(-1)?.get('refresh_token')).toBe(rotatedFrom);
    const [after] = await t.db.select().from(schema.connections).where(eq(schema.connections.id, conn.id));
    expect(after?.credentials).not.toBe(row?.credentials);
    // The next refresh sends the rotated token.
    g.state.accessToken = 'expired-again';
    expect(await syncNow()).toMatchObject({ status: 'ok' });
    expect(g.tokenRequests.at(-1)?.get('refresh_token')).not.toBe(rotatedFrom);

    g.state.revoked = true;
    g.state.accessToken = 'expired-for-good';
    const failed = await syncNow();
    expect(failed.status).toBe('error');
    expect(failed.lastError).toContain('connect Microsoft again');
    g.state.revoked = false;
  });

  test("another user can't see, change or sync the connection", async () => {
    expect((await connections(bob)).map((c) => c.id)).not.toContain(conn.id);
    expect((await req('GET', `/connections/${conn.id}/remote-calendars`, bob)).status).toBe(404);
    expect((await req('PUT', `/connections/${conn.id}/calendars`, bob, { remoteIds: [] })).status).toBe(404);
    expect((await req('POST', `/connections/${conn.id}/sync`, bob)).status).toBe(404);
    expect((await req('DELETE', `/connections/${conn.id}`, bob)).status).toBe(404);
  });

  test('removing the connection leaves Outlook alone', async () => {
    expect((await req('DELETE', `/connections/${conn.id}`, ada)).status).toBe(204);
    expect(g.get('standup')).toBeDefined();
  });
});
