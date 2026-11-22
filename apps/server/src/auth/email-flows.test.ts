// Email confirmation and password reset on a throwaway database, with the emails caught by a fake
// SMTP server: sign-up → unconfirmed → blocked → confirm → allowed, resending, the reset flow with
// expired and used links, and what a server without email does instead.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { schema } from '@homa/db';
import { createEmailVerificationToken } from 'better-auth/api';
import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '@/config';
import { createApp } from '@/http';
import { notifySettingsFrom } from '@/reminders';
import { freshDb, linkIn, startFakeSmtp, testAuth, testDatabaseUrl } from '@/testing';

const smtp = await startFakeSmtp();
const SECRET = 'x'.repeat(32);
const PASSWORD = 'correct horse battery';

describe.skipIf(!testDatabaseUrl)('with email set up and confirmation required', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  let plain: ReturnType<typeof createApp>;

  beforeAll(async () => {
    t = await freshDb();
    const notify = notifySettingsFrom(
      loadConfig({
        DATABASE_URL: 'postgres://homa@localhost/homa',
        BETTER_AUTH_SECRET: SECRET,
        HOMA_SMTP_URL: `smtp://127.0.0.1:${smtp.port}`,
        HOMA_MAIL_FROM: 'Homa <homa@example.com>',
      }),
    );
    const auth = testAuth(t.db, undefined, { sendMail: notify.sendMail, requireEmailVerification: true });
    app = createApp({ db: t.db, auth, notify });
    plain = createApp({ db: t.db, auth: testAuth(t.db) });
  });
  afterAll(async () => {
    await smtp.stop();
    await t.drop();
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}, on = app) =>
    on.request(`/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...headers },
      body: JSON.stringify(body),
    });
  const signUp = (email: string, headers?: Record<string, string>) =>
    post('/sign-up/email', { email, password: PASSWORD, name: email.split('@')[0] }, headers);
  const signIn = (email: string, password = PASSWORD) => post('/sign-in/email', { email, password });
  /** Follows an emailed link as the browser would, without following the redirect. */
  const open = (url: string) => {
    const u = new URL(url);
    return app.request(`${u.pathname}${u.search}`);
  };
  const mailTo = (email: string, from: number) => smtp.waitFor((m) => m.includes(`To: ${email}`), { from });

  test('the admin is confirmed at sign-up and signs in straight away', async () => {
    const res = await signUp('ada@example.com');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { emailVerified: boolean } }).user.emailVerified).toBe(true);
    expect((await signIn('ada@example.com')).status).toBe(200);
    await Bun.sleep(200);
    expect(smtp.mails).toEqual([]); // no confirmation link for an address that's already confirmed
  });

  test('a new account is blocked until it confirms its address, then signed in', async () => {
    const from = smtp.mails.length;
    const res = await signUp('bob@example.com');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { token: string | null }).token).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();

    const mail = await mailTo('bob@example.com', from);
    expect(mail).toContain('Subject: Confirm your email address for Homa');
    expect(mail).toContain('Content-Type: text/html');

    const blocked = await signIn('bob@example.com');
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { code: string }).code).toBe('EMAIL_NOT_VERIFIED');

    const confirmed = await open(linkIn(mail, '/api/auth/verify-email'));
    expect(confirmed.status).toBe(302);
    expect(confirmed.headers.get('location')).toBe('/verify-email');
    expect(confirmed.headers.get('set-cookie')).toContain('session_token');
    expect((await signIn('bob@example.com')).status).toBe(200);
  });

  test('a bad or expired confirmation link lands on the page with the reason', async () => {
    const bad = await app.request('/api/auth/verify-email?token=nope&callbackURL=/verify-email');
    expect(bad.headers.get('location')).toBe('/verify-email?error=INVALID_TOKEN');
    const old = await createEmailVerificationToken(SECRET, 'bob@example.com', undefined, -60);
    const expired = await app.request(`/api/auth/verify-email?token=${old}&callbackURL=/verify-email`);
    expect(expired.headers.get('location')).toBe('/verify-email?error=TOKEN_EXPIRED');
  });

  test('resending: a new link for an unconfirmed address, the same answer for any other', async () => {
    await signUp('cy@example.com');
    await mailTo('cy@example.com', 0);
    const from = smtp.mails.length;
    const resend = await post('/send-verification-email', { email: 'cy@example.com' });
    expect(resend.status).toBe(200);
    await mailTo('cy@example.com', from);

    const unknown = await post('/send-verification-email', { email: 'nobody@example.com' });
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual(await resend.json());
    await Bun.sleep(200);
    expect(smtp.mails.slice(from).some((m) => m.includes('nobody@example.com'))).toBe(false);
  });

  test('signing in unconfirmed sends a fresh link', async () => {
    const from = smtp.mails.length;
    expect((await signIn('cy@example.com')).status).toBe(403);
    await mailTo('cy@example.com', from);
  });

  test('the email follows the request language', async () => {
    const from = smtp.mails.length;
    await signUp('dara@example.com', { 'accept-language': 'fa-IR,fa;q=0.9' });
    const mail = await mailTo('dara@example.com', from);
    expect(mail).toContain('lang=3D"fa"'); // quoted-printable for lang="fa"
  });

  test('a reset link sets a new password once, and signs out everywhere', async () => {
    const session = (await signIn('ada@example.com')).headers.get('set-cookie')?.split(';')[0] ?? '';
    const from = smtp.mails.length;
    const known = await post('/request-password-reset', { email: 'ada@example.com', redirectTo: '/reset-password' });
    const unknown = await post('/request-password-reset', { email: 'nobody@example.com' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());

    const mail = await mailTo('ada@example.com', from);
    expect(mail).toContain('Subject: Reset your Homa password');
    const landed = await open(linkIn(mail, '/api/auth/reset-password/'));
    expect(landed.status).toBe(302);
    const location = new URL(landed.headers.get('location') ?? '', 'http://localhost:3000');
    expect(location.pathname).toBe('/reset-password');
    const token = location.searchParams.get('token') ?? '';
    expect(token).not.toBe('');

    expect((await post('/reset-password', { token, newPassword: 'a whole new one' })).status).toBe(200);
    expect((await signIn('ada@example.com')).status).toBe(401);
    expect((await signIn('ada@example.com', 'a whole new one')).status).toBe(200);
    const after = await app.request('/api/auth/get-session', { headers: { cookie: session } });
    expect(await after.json()).toBeNull();

    // Used once: the same link no longer works.
    const again = await post('/reset-password', { token, newPassword: 'and another one' });
    expect(again.status).toBe(400);
    expect(((await again.json()) as { code: string }).code).toBe('INVALID_TOKEN');
  });

  test('an expired reset link is refused', async () => {
    const from = smtp.mails.length;
    await post('/request-password-reset', { email: 'bob@example.com' });
    const link = linkIn(await mailTo('bob@example.com', from), '/api/auth/reset-password/');
    const token = new URL(link).pathname.split('/').pop() ?? '';
    await t.db
      .update(schema.verifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.verifications.identifier, `reset-password:${token}`));

    expect((await open(link)).headers.get('location')).toBe('http://localhost:3000/reset-password?error=INVALID_TOKEN');
    expect((await post('/reset-password', { token, newPassword: 'too late now' })).status).toBe(400);
  });

  test('the instance says whether reset links can be sent', async () => {
    const withEmail = (await (await app.request('/api/instance')).json()) as { passwordReset: boolean };
    const without = (await (await plain.request('/api/instance')).json()) as { passwordReset: boolean };
    expect(withEmail.passwordReset).toBe(true);
    expect(without.passwordReset).toBe(false);
  });

  test('without email: new accounts sign in at once, and reset links are unavailable', async () => {
    const res = await post('/sign-up/email', { email: 'eve@example.com', password: PASSWORD, name: 'Eve' }, {}, plain);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('session_token');
    const reset = await post('/request-password-reset', { email: 'eve@example.com' }, {}, plain);
    expect(reset.status).toBe(400);
  });

  test('the upgrade migration marks existing accounts confirmed', async () => {
    await t.db.update(schema.users).set({ emailVerified: false });
    const file = new URL('../../../../packages/db/drizzle/0014_verify_existing_users.sql', import.meta.url);
    await t.db.execute(sql.raw(readFileSync(file, 'utf8')));
    const rows = await t.db.select({ v: schema.users.emailVerified }).from(schema.users);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.v)).toBe(true);
  });
});
