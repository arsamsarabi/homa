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
    expect(await res.json()).toEqual({
      homeTz: null,
      secondaryCalendar: 'none',
      weekStart: null,
      workWeekDays: null,
      defaultReminderMinutes: 10,
      sharingPreset: 'private',
      showShortcutHints: true,
    });
  });

  test('a change is saved for that user only', async () => {
    const a = await signUp('a@example.com');
    const b = await signUp('b@example.com');
    const res = await patch(a, { homeTz: 'Asia/Tehran', secondaryCalendar: 'jalali' });
    expect(await res.json()).toEqual({
      homeTz: 'Asia/Tehran',
      secondaryCalendar: 'jalali',
      weekStart: null,
      workWeekDays: null,
      defaultReminderMinutes: 10,
      sharingPreset: 'private',
      showShortcutHints: true,
    });
    expect(await (await get(a)).json()).toEqual({
      homeTz: 'Asia/Tehran',
      secondaryCalendar: 'jalali',
      weekStart: null,
      workWeekDays: null,
      defaultReminderMinutes: 10,
      sharingPreset: 'private',
      showShortcutHints: true,
    });
    expect(await (await get(b)).json()).toEqual({
      homeTz: null,
      secondaryCalendar: 'none',
      weekStart: null,
      workWeekDays: null,
      defaultReminderMinutes: 10,
      sharingPreset: 'private',
      showShortcutHints: true,
    });

    // A partial change keeps the rest; null goes back to the browser's zone.
    expect(await (await patch(a, { homeTz: null })).json()).toEqual({
      homeTz: null,
      secondaryCalendar: 'jalali',
      weekStart: null,
      workWeekDays: null,
      defaultReminderMinutes: 10,
      sharingPreset: 'private',
      showShortcutHints: true,
    });
  });

  test('an empty change keeps the settings', async () => {
    const res = await patch(await signUp('empty@example.com'), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      homeTz: null,
      secondaryCalendar: 'none',
      weekStart: null,
      workWeekDays: null,
      defaultReminderMinutes: 10,
      sharingPreset: 'private',
      showShortcutHints: true,
    });
  });

  test('unknown zones and calendars are rejected', async () => {
    const a = await signUp('bad@example.com');
    expect((await patch(a, { homeTz: 'Mars/Olympus' })).status).toBe(400);
    expect((await patch(a, { secondaryCalendar: 'mayan' })).status).toBe(400);
    expect((await patch(a, { weekStart: 7 })).status).toBe(400);
    expect((await patch(a, { workWeekDays: [] })).status).toBe(400);
    expect((await patch(a, { workWeekDays: [1, 1] })).status).toBe(400);
    expect((await patch(a, { workWeekDays: [7] })).status).toBe(400);
  });

  test('work week days can be set and cleared', async () => {
    const a = await signUp('workweek@example.com');
    expect(await (await patch(a, { workWeekDays: [1, 3, 5] })).json()).toMatchObject({ workWeekDays: [1, 3, 5] });
    expect(await (await get(a)).json()).toMatchObject({ workWeekDays: [1, 3, 5] });
    expect(await (await patch(a, { workWeekDays: null })).json()).toMatchObject({ workWeekDays: null });
  });

  test('the first day of the week can be set and cleared', async () => {
    const a = await signUp('week@example.com');
    expect(await (await patch(a, { weekStart: 0 })).json()).toMatchObject({ weekStart: 0 });
    expect(await (await get(a)).json()).toMatchObject({ weekStart: 0 });
    expect(await (await patch(a, { weekStart: null })).json()).toMatchObject({
      weekStart: null,
      defaultReminderMinutes: 10,
    });
  });

  test('needs a session', async () => {
    expect((await get('')).status).toBe(401);
    expect((await patch('', { homeTz: 'UTC' })).status).toBe(401);
  });

  test('the default reminder can be changed or turned off', async () => {
    const a = await signUp('reminder@example.com');
    expect(await (await patch(a, { defaultReminderMinutes: 1440 })).json()).toMatchObject({
      defaultReminderMinutes: 1440,
    });
    expect(await (await patch(a, { defaultReminderMinutes: null })).json()).toMatchObject({
      defaultReminderMinutes: null,
    });
    expect((await patch(a, { defaultReminderMinutes: -5 })).status).toBe(400);
  });
});
