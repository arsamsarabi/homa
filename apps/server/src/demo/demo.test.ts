// Demo mode: the guard's rules, the seed, the reset, and the guarded app end to end.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { repo, schema } from '@homa/db';
import { sql } from 'drizzle-orm';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';
import { DEMO_ACCOUNT } from './account';
import { blockedInDemo } from './guard';
import { resetDemo, seedDemo } from './seed';

test('the guard lets visitors sign in and use the app, and nothing else', () => {
  const allowed = [
    ['POST', '/api/auth/sign-in/email'],
    ['POST', '/api/auth/sign-in/passkey'],
    ['POST', '/api/auth/sign-out'],
    ['GET', '/api/auth/get-session'],
    ['POST', '/api/events'],
    ['PATCH', '/api/settings'],
    ['POST', '/api/tasks/import/todoist'],
    ['GET', '/api/connections'],
    ['GET', '/api/admin/instance'],
  ];
  const blocked = [
    ['POST', '/api/auth/sign-up/email'],
    ['POST', '/api/auth/change-password'],
    ['POST', '/api/auth/change-email'],
    ['POST', '/api/auth/update-user'],
    ['POST', '/api/auth/delete-user'],
    ['POST', '/api/auth/revoke-other-sessions'],
    ['POST', '/api/auth/request-password-reset'],
    ['POST', '/api/auth/admin/create-user'],
    ['POST', '/api/auth/sign-in/email/'],
    ['POST', '/api/auth/passkey/add-passkey'],
    ['POST', '/api/connections/ics'],
    ['POST', '/api/connections/caldav'],
    ['POST', '/api/connections/x/sync'],
    ['GET', '/api/connections/google/start'],
    ['GET', '/api/connections/microsoft/start'],
    ['POST', '/api/notification-channels'],
    ['PATCH', '/api/notification-channels/x'],
    ['POST', '/api/notification-channels/x/test'],
    ['POST', '/api/push/subscriptions'],
    ['PATCH', '/api/admin/instance'],
  ];
  for (const [m, p] of allowed) expect([m, p, blockedInDemo(String(m), String(p))]).toEqual([m, p, false]);
  for (const [m, p] of blocked) expect([m, p, blockedInDemo(String(m), String(p))]).toEqual([m, p, true]);
});

describe.skipIf(!testDatabaseUrl)('demo instance', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  const opts = { secret: 'x'.repeat(32), baseURL: 'http://localhost:3000' };
  const now = new Date('2026-11-23T12:00:00Z');
  const origin = 'http://localhost:3000';

  const post = async (path: string, body: unknown, cookie = ''): Promise<Response> =>
    app.request(`/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, cookie },
      body: JSON.stringify(body),
    });
  const signIn = async (): Promise<string> => {
    const res = await post('/auth/sign-in/email', { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    expect(res.status).toBe(200);
    return res.headers.get('set-cookie')?.split(';')[0] ?? '';
  };
  const count = async (table: string): Promise<number> => {
    const r = await t.db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${table}"`));
    return Number((r.rows[0] as { n: number }).n);
  };

  beforeAll(async () => {
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db), demo: true });
  });
  afterAll(async () => {
    await t.drop();
  });

  test('the seed makes the admin account with calendars, events, tasks, projects and reminders', async () => {
    await seedDemo(t.db, opts, now);
    const [user] = await t.db.select().from(schema.users);
    expect(user).toMatchObject({ email: DEMO_ACCOUNT.email, role: 'admin', emailVerified: true });
    expect(await count('calendars')).toBe(3);
    expect(await count('events')).toBeGreaterThan(10);
    expect(await count('event_instances')).toBeGreaterThan(30);
    expect(await count('tasks')).toBeGreaterThan(10);
    expect(await count('projects')).toBe(3);
    expect(await count('reminders')).toBeGreaterThan(3);
  });

  test('visitors sign in with the shared account and can use the app', async () => {
    const cookie = await signIn();
    const res = await app.request('/api/occurrences?from=2026-11-23T00:00:00Z&to=2026-11-30T00:00:00Z', {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as unknown[]).length).toBeGreaterThan(5);
    const [cal] = await t.db.select().from(schema.calendars);
    const created = await post(
      '/events',
      { calendarId: cal?.id, summary: 'Try it', start: '2026-11-24T10:00:00Z', end: '2026-11-24T11:00:00Z', tz: 'UTC' },
      cookie,
    );
    expect(created.status).toBe(201);
  });

  test('the instance hands out the demo sign-in', async () => {
    const body = (await (await app.request('/api/instance')).json()) as { demo: unknown };
    expect(body.demo).toEqual({ email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    const plain = createApp({ db: t.db, auth: testAuth(t.db) });
    expect(((await (await plain.request('/api/instance')).json()) as { demo: unknown }).demo).toBeNull();
  });

  test('what leaves the server or locks others out answers 403', async () => {
    const cookie = await signIn();
    const blocked = [
      ['/auth/sign-up/email', { email: 'x@example.com', password: 'correct horse', name: 'x' }],
      ['/auth/change-password', { currentPassword: DEMO_ACCOUNT.password, newPassword: 'something else' }],
      ['/connections/ics', { url: 'https://example.com/cal.ics' }],
      ['/notification-channels', { kind: 'webhook', name: 'x', url: 'https://example.com' }],
      ['/push/subscriptions', { endpoint: 'https://push.example.com/x', keys: { p256dh: 'a', auth: 'b' } }],
    ] as const;
    for (const [path, body] of blocked) {
      const res = await post(path, body, cookie);
      expect([path, res.status]).toEqual([path, 403]);
      expect(await res.json()).toEqual({ error: expect.any(String) });
    }
    expect(await count('users')).toBe(1);
  });

  test('the reset drops every account and its data, then seeds again', async () => {
    await post('/auth/sign-in/email', { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password });
    const before = await count('events');
    const uid = await resetDemo(t.db, opts, now);
    const users = await t.db.select().from(schema.users);
    expect(users.map((u) => u.id)).toEqual([uid]);
    // Visitors are signed out (the seed's own sign-up leaves one session for the new account).
    const sessions = await t.db.select().from(schema.sessions);
    expect(sessions.every((s) => s.userId === uid)).toBe(true);
    // The visitor's event went with the old account; the seed's are back.
    expect(await count('events')).toBe(before - 1);
    expect(await count('instance_settings')).toBe(1);
  });

  test('the wipe leaves no rows behind but the instance settings', async () => {
    await repo.wipeAllAccounts(t.db);
    const tables = await t.db.execute(
      sql`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const left: string[] = [];
    for (const { name } of tables.rows as { name: string }[]) {
      if (name !== 'instance_settings' && (await count(name)) > 0) left.push(name);
    }
    expect(left).toEqual([]);
  });
});
