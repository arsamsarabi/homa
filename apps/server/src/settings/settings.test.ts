import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';

describe.skipIf(!testDatabaseUrl)('settings', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;

  const headers = (cookie = '') => ({ 'content-type': 'application/json', origin: 'http://localhost:3000', cookie });
  const signUp = async (email: string) => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password: 'correct horse battery', name: 'x' }),
    });
    return res.headers.get('set-cookie')?.split(';')[0] ?? '';
  };
  const get = async (cookie: string) => app.request('/api/settings', { headers: headers(cookie) });
  const patch = async (cookie: string, body: unknown) =>
    app.request('/api/settings', { method: 'PATCH', headers: headers(cookie), body: JSON.stringify(body) });

  beforeAll(async () => {
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db) });
  });
  afterAll(() => t.drop());

  test('new users use the browser zone and no second calendar', async () => {
    const res = await get(await signUp('new@example.com'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ homeTz: null, secondaryCalendar: 'none' });
  });

  test('a change is saved for that user only', async () => {
    const a = await signUp('a@example.com');
    const b = await signUp('b@example.com');
    const res = await patch(a, { homeTz: 'Asia/Tehran', secondaryCalendar: 'jalali' });
    expect(await res.json()).toEqual({ homeTz: 'Asia/Tehran', secondaryCalendar: 'jalali' });
    expect(await (await get(a)).json()).toEqual({ homeTz: 'Asia/Tehran', secondaryCalendar: 'jalali' });
    expect(await (await get(b)).json()).toEqual({ homeTz: null, secondaryCalendar: 'none' });

    // A partial change keeps the rest; null goes back to the browser's zone.
    expect(await (await patch(a, { homeTz: null })).json()).toEqual({ homeTz: null, secondaryCalendar: 'jalali' });
  });

  test('an empty change keeps the settings', async () => {
    const res = await patch(await signUp('empty@example.com'), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ homeTz: null, secondaryCalendar: 'none' });
  });

  test('unknown zones and calendars are rejected', async () => {
    const a = await signUp('bad@example.com');
    expect((await patch(a, { homeTz: 'Mars/Olympus' })).status).toBe(400);
    expect((await patch(a, { secondaryCalendar: 'mayan' })).status).toBe(400);
  });

  test('needs a session', async () => {
    expect((await get('')).status).toBe(401);
    expect((await patch('', { homeTz: 'UTC' })).status).toBe(401);
  });
});
