import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { schema } from '@homa/db';
import { createApp } from '../http';
import { freshDb, testDatabaseUrl } from '../testing';
import { createAuth } from './auth';
import { purgeExpiredAuth } from './maintenance';

describe.skipIf(!testDatabaseUrl)('with a database', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    t = await freshDb();
    app = createApp({ db: t.db, auth: createAuth(t.db, { secret: 'x'.repeat(32), baseURL: 'http://localhost:3000' }) });
  });
  afterAll(() => t.drop());

  const signUp = (email: string) =>
    app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'correct horse battery', name: email.split('@')[0] }),
    });

  test('the first account is the admin, later ones are users', async () => {
    const first = await signUp('ada@example.com');
    expect(first.status).toBe(200);
    const second = await signUp('bob@example.com');
    expect(second.status).toBe(200);

    const rows = await t.db.select({ email: schema.users.email, role: schema.users.role }).from(schema.users);
    expect(rows.sort((a, b) => a.email.localeCompare(b.email))).toEqual([
      { email: 'ada@example.com', role: 'admin' },
      { email: 'bob@example.com', role: 'user' },
    ]);
  });

  test('sign-in returns a session cookie that get-session accepts', async () => {
    const res = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery' }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toBeTruthy();

    const session = await app.request('/api/auth/get-session', { headers: { cookie: cookie ?? '' } });
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe('ada@example.com');
  });

  test('purge removes only expired sessions', async () => {
    const [user] = await t.db.select({ id: schema.users.id }).from(schema.users).limit(1);
    if (!user) throw new Error('expected a user from the sign-up test');
    const past = new Date(Date.now() - 60_000);
    await t.db.insert(schema.sessions).values({ id: 'old', token: 'old', userId: user.id, expiresAt: past });

    const before = await t.db.$count(schema.sessions);
    expect(await purgeExpiredAuth(t.db)).toEqual({ sessions: 1, verifications: 0 });
    expect(await t.db.$count(schema.sessions)).toBe(before - 1);
  });
});
