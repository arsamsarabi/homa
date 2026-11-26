import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { schema } from '@homa/db';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';
import { createSetupGate, SETUP_CODE_HEADER } from './setup-code';

describe.skipIf(!testDatabaseUrl)('instance', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;

  const headers = (cookie = '') => ({ 'content-type': 'application/json', origin: 'http://localhost:3000', cookie });
  const signUp = (email: string, setupCode?: string) =>
    app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { ...headers(), ...(setupCode === undefined ? {} : { [SETUP_CODE_HEADER]: setupCode }) },
      body: JSON.stringify({ email, password: 'correct horse battery', name: 'x' }),
    });
  const cookieOf = (res: Response) => res.headers.get('set-cookie')?.split(';')[0] ?? '';
  const publicInstance = async () => (await (await app.request('/api/instance')).json()) as Record<string, unknown>;
  const getAdmin = (cookie: string) => app.request('/api/admin/instance', { headers: headers(cookie) });
  const patchAdmin = (cookie: string, body: unknown) =>
    app.request('/api/admin/instance', { method: 'PATCH', headers: headers(cookie), body: JSON.stringify(body) });

  let admin = '';
  let user = '';

  beforeAll(async () => {
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db, createSetupGate({ fixed: '4321', announce: () => {} })) });
  });
  afterAll(() => t.drop());

  test('a new instance needs setup and has the defaults', async () => {
    expect(await publicInstance()).toEqual({
      name: 'Homa',
      signUpsOpen: true,
      needsSetup: true,
      defaultLanguage: 'en',
      googleCalendar: false,
      microsoftCalendar: false,
      passwordReset: false,
      anyoneCanInvite: false,
      demo: null,
    });
  });

  test('the first account needs the setup code from the log', async () => {
    expect((await signUp('admin@example.com')).status).toBe(400);
    const wrong = await signUp('admin@example.com', '1111');
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { message: string }).message).toMatch(/setup code/);
    expect((await publicInstance()).needsSetup).toBe(true);
  });

  test('the first account is the admin and finishes setup', async () => {
    const res = await signUp('admin@example.com', '4321');
    expect(res.status).toBe(200);
    admin = cookieOf(res);
    const [row] = await t.db.select({ role: schema.users.role }).from(schema.users);
    expect(row?.role).toBe('admin');
    expect((await publicInstance()).needsSetup).toBe(false);
    expect(await (await getAdmin(admin)).json()).toEqual({
      name: 'Homa',
      signUps: 'open',
      invites: 'admins',
      defaultLanguage: 'en',
      defaultHomeTz: null,
      defaultSecondaryCalendar: 'none',
    });
  });

  test('the admin can change the settings, and the public view follows', async () => {
    const res = await patchAdmin(admin, {
      name: '  Family  ',
      defaultLanguage: 'fa',
      defaultHomeTz: 'Asia/Tehran',
      defaultSecondaryCalendar: 'jalali',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      name: 'Family',
      signUps: 'open',
      invites: 'admins',
      defaultLanguage: 'fa',
      defaultHomeTz: 'Asia/Tehran',
      defaultSecondaryCalendar: 'jalali',
    });
    expect(await publicInstance()).toEqual({
      name: 'Family',
      signUpsOpen: true,
      needsSetup: false,
      defaultLanguage: 'fa',
      googleCalendar: false,
      microsoftCalendar: false,
      passwordReset: false,
      anyoneCanInvite: false,
      demo: null,
    });
  });

  test('bad values are rejected', async () => {
    expect((await patchAdmin(admin, { defaultHomeTz: 'Mars/Olympus' })).status).toBe(400);
    expect((await patchAdmin(admin, { signUps: 'maybe' })).status).toBe(400);
    expect((await patchAdmin(admin, { name: '   ' })).status).toBe(400);
  });

  test('new accounts start with the instance defaults', async () => {
    const res = await signUp('user@example.com');
    expect(res.status).toBe(200);
    user = cookieOf(res);
    const settings = await app.request('/api/settings', { headers: headers(user) });
    expect(await settings.json()).toEqual({
      homeTz: 'Asia/Tehran',
      secondaryCalendar: 'jalali',
      weekStart: null,
      workWeekDays: null,
      defaultReminderMinutes: 10,
      sharingPreset: 'private',
    });
  });

  test('only an admin reaches the admin settings', async () => {
    expect((await getAdmin(user)).status).toBe(403);
    expect((await patchAdmin(user, { signUps: 'closed' })).status).toBe(403);
    expect((await getAdmin('')).status).toBe(401);
    expect((await patchAdmin('', { signUps: 'closed' })).status).toBe(401);
  });

  test('closed sign-ups turn new people away', async () => {
    expect((await patchAdmin(admin, { signUps: 'closed' })).status).toBe(200);
    expect((await publicInstance()).signUpsOpen).toBe(false);
    const res = await signUp('late@example.com');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toContain('Sign-ups are closed');
    expect(await t.db.$count(schema.users)).toBe(2);
  });
});
