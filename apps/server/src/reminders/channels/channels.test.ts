// Notification channels on a throwaway database: the API (ownership, secrets kept out of answers,
// address checks), each sender against a local fake (ntfy, Gotify, webhook, SMTP), retries and the
// "failing" status, and the delivery job queueing per reminder kind.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { schema } from '@homa/db';
import { loadConfig } from '@/config';
import { createApp } from '@/http';
import { deliverReminders } from '@/reminders/delivery';
import type { PushSettings } from '@/reminders/push';
import { reminderSenders } from '@/reminders/senders';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';
import { notifySettingsFrom } from './settings';

type Json = Record<string, unknown>;
type Hit = { path: string; headers: Headers; body: string };

describe.skipIf(!testDatabaseUrl)('notification channels', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  let strict: ReturnType<typeof createApp>;
  let ada = '';
  let bob = '';

  // One fake HTTP server for ntfy, Gotify and webhooks: records each POST, answers with `status`.
  const hits: Hit[] = [];
  let status = 200;
  const http = Bun.serve({
    port: 0,
    fetch: async (req: Request): Promise<Response> => {
      hits.push({ path: new URL(req.url).pathname, headers: req.headers, body: await req.text() });
      return new Response('{}', { status });
    },
  });
  const base = `http://127.0.0.1:${http.port}`;

  // A fake SMTP server: just enough of the protocol for nodemailer, refusing RCPT with 550 on request.
  const mails: string[] = [];
  let refuseMail = false;
  type Smtp = { buf: string; inData: boolean; msg: string };
  const smtp = Bun.listen<Smtp>({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      open(s) {
        s.data = { buf: '', inData: false, msg: '' };
        s.write('220 fake ESMTP\r\n');
      },
      data(s, chunk) {
        s.data.buf += chunk.toString();
        for (let i = s.data.buf.indexOf('\r\n'); i >= 0; i = s.data.buf.indexOf('\r\n')) {
          const line = s.data.buf.slice(0, i);
          s.data.buf = s.data.buf.slice(i + 2);
          if (s.data.inData) {
            if (line === '.') {
              s.data.inData = false;
              mails.push(s.data.msg);
              s.data.msg = '';
              s.write('250 queued\r\n');
            } else s.data.msg += `${line}\n`;
            continue;
          }
          const cmd = line.slice(0, 4).toUpperCase();
          if (cmd === 'EHLO' || cmd === 'HELO') s.write('250 fake\r\n');
          else if (cmd === 'RCPT' && refuseMail) s.write('550 no such user\r\n');
          else if (cmd === 'DATA') {
            s.data.inData = true;
            s.write('354 go on\r\n');
          } else if (cmd === 'QUIT') {
            s.write('221 bye\r\n');
            s.end();
          } else s.write('250 ok\r\n');
        }
      },
    },
  });

  const env = {
    DATABASE_URL: 'postgres://homa@localhost/homa',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    HOMA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    HOMA_SMTP_URL: `smtp://127.0.0.1:${smtp.port}`,
    HOMA_MAIL_FROM: 'Homa <homa@example.com>',
    HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS: 'true',
  };
  const notify = notifySettingsFrom(loadConfig(env));
  const noPush: PushSettings = {
    allowPrivate: true,
    vapid: async () => ({ publicKey: '', privateKey: '', subject: '' }),
  };

  const call = async (method: string, path: string, body?: unknown, as = ada, on = app) => {
    const res = await on.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie: as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (res.status === 204 ? {} : await res.json()) as Json };
  };
  const signUp = async (email: string) => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'correct horse battery', name: 'x' }),
    });
    return res.headers.get('set-cookie')?.split(';')[0] ?? '';
  };

  beforeAll(async () => {
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db), notify });
    // The defaults: no private networks, no SMTP.
    const { HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS: _, HOMA_SMTP_URL: __, HOMA_MAIL_FROM: ___, ...rest } = env;
    strict = createApp({ db: t.db, auth: testAuth(t.db), notify: notifySettingsFrom(loadConfig(rest)) });
    ada = await signUp('ada@example.com');
    bob = await signUp('bob@example.com');
  });
  beforeEach(async () => {
    await t.db.delete(schema.notificationChannels);
    await t.db.delete(schema.reminders);
    await t.db.delete(schema.notifications);
    hits.length = 0;
    mails.length = 0;
    status = 200;
    refuseMail = false;
  });
  afterAll(async () => {
    await http.stop();
    smtp.stop(true);
    await t.drop();
  });

  test('routes need a session, and another user’s channel is a 404', async () => {
    expect((await call('GET', '/notification-channels', undefined, '')).status).toBe(401);
    const id = (await call('POST', '/notification-channels', { kind: 'email', name: 'Mail' })).body.id;
    expect((await call('PATCH', `/notification-channels/${id}`, { name: 'x' }, bob)).status).toBe(404);
    expect((await call('POST', `/notification-channels/${id}/test`, undefined, bob)).status).toBe(404);
    expect((await call('DELETE', `/notification-channels/${id}`, undefined, bob)).status).toBe(404);
    expect((await call('GET', '/notification-channels', undefined, bob)).body.items).toEqual([]);
    expect((await call('DELETE', `/notification-channels/${id}`)).status).toBe(204);
  });

  test('tokens and webhook addresses stay out of answers; the secret shows once', async () => {
    const ntfy = await call('POST', '/notification-channels', {
      kind: 'ntfy',
      name: 'Phone',
      server: base,
      topic: 'ada-123',
      token: 'tk_secret',
      reminderKinds: ['event'],
    });
    expect(ntfy.status).toBe(201);
    expect(ntfy.body).toMatchObject({ server: `${base}/`, topic: 'ada-123', hasToken: true, reminderKinds: ['event'] });
    expect(JSON.stringify(ntfy.body)).not.toContain('tk_secret');
    const hook = await call('POST', '/notification-channels', {
      kind: 'webhook',
      name: 'Hook',
      url: `${base}/hook/abc`,
    });
    expect(hook.body.host).toBe(`127.0.0.1:${http.port}`);
    expect(String(hook.body.secret).length).toBeGreaterThan(30);
    const list = await call('GET', '/notification-channels');
    expect(list.body.email).toBe(true);
    expect(JSON.stringify(list.body)).not.toMatch(/tk_secret|hook\/abc|"secret"/);
    // The stored config is ciphertext.
    const [row] = await t.db.select().from(schema.notificationChannels).limit(1);
    expect(row?.config).toMatch(/^v1\./);
    // Removing the token, renaming; a rotated secret is shown again.
    const patched = await call('PATCH', `/notification-channels/${ntfy.body.id}`, { token: null, name: 'Mobile' });
    expect(patched.body).toMatchObject({ name: 'Mobile', hasToken: false, topic: 'ada-123' });
    const rotated = await call('PATCH', `/notification-channels/${hook.body.id}`, { rotateSecret: true });
    expect(rotated.body.secret).not.toBe(hook.body.secret);
  });

  test('addresses must be public https unless private networks are allowed; email needs SMTP', async () => {
    const add = (body: Json) => call('POST', '/notification-channels', body, ada, strict);
    expect((await add({ kind: 'gotify', name: 'G', server: base, token: 't' })).body.error).toMatch(/https/);
    expect((await add({ kind: 'gotify', name: 'G', server: 'https://127.0.0.1', token: 't' })).body.error).toMatch(
      /private/,
    );
    expect((await add({ kind: 'webhook', name: 'W', url: 'https://user:pw@example.com/x' })).body.error).toMatch(
      /token/,
    );
    expect((await add({ kind: 'email', name: 'Mail' })).body.error).toMatch(/Email is not set up/);
    expect((await call('GET', '/notification-channels', undefined, ada, strict)).body.email).toBe(false);
    expect((await add({ kind: 'ntfy', name: 'N', topic: 'has space' })).status).toBe(400);
  });

  test('ntfy, Gotify and webhooks get what they expect; the webhook is signed', async () => {
    const make = async (body: Json) => String((await call('POST', '/notification-channels', body)).body.id);
    const ntfy = await make({ kind: 'ntfy', name: 'N', server: base, topic: 'ada', token: 'tk' });
    const gotify = await make({ kind: 'gotify', name: 'G', server: `${base}/gotify`, token: 'app-token' });
    const created = await call('POST', '/notification-channels', { kind: 'webhook', name: 'W', url: `${base}/hook` });

    expect((await call('POST', `/notification-channels/${ntfy}/test`)).body).toEqual({ ok: true });
    expect(hits[0]?.path).toBe('/');
    expect(hits[0]?.headers.get('authorization')).toBe('Bearer tk');
    expect(JSON.parse(hits[0]?.body ?? '{}')).toMatchObject({ topic: 'ada', title: 'Test from Homa' });

    expect((await call('POST', `/notification-channels/${gotify}/test`)).body).toEqual({ ok: true });
    expect(hits[1]?.path).toBe('/gotify/message');
    expect(hits[1]?.headers.get('x-gotify-key')).toBe('app-token');

    expect((await call('POST', `/notification-channels/${created.body.id}/test`)).body).toEqual({ ok: true });
    const hook = hits[2];
    const ts = hook?.headers.get('x-homa-timestamp') ?? '';
    const expected = createHmac('sha256', String(created.body.secret)).update(`${ts}.${hook?.body}`).digest('hex');
    expect(hook?.headers.get('x-homa-signature')).toBe(`sha256=${expected}`);
    expect(JSON.parse(hook?.body ?? '{}')).toMatchObject({ type: 'test' });
  });

  test('email goes to the account’s own address over SMTP; a refusal is reported', async () => {
    const id = (await call('POST', '/notification-channels', { kind: 'email', name: 'Mail' })).body.id;
    expect((await call('POST', `/notification-channels/${id}/test`)).body).toEqual({ ok: true });
    expect(mails[0]).toContain('To: ada@example.com');
    expect(mails[0]).toContain('Subject: Test from Homa');
    refuseMail = true;
    expect((await call('POST', `/notification-channels/${id}/test`)).body).toEqual({
      ok: false,
      error: 'the mail server answered 550',
    });
  });

  test('a channel that keeps failing shows as failing with its error; a success clears it', async () => {
    const id = (await call('POST', '/notification-channels', { kind: 'ntfy', name: 'N', server: base, topic: 'a' }))
      .body.id;
    status = 503;
    for (let i = 0; i < 3; i++) await call('POST', `/notification-channels/${id}/test`);
    const failing = ((await call('GET', '/notification-channels')).body.items as Json[])[0];
    expect(failing).toMatchObject({ failing: true, lastError: `127.0.0.1:${http.port} answered 503` });
    status = 200;
    await call('POST', `/notification-channels/${id}/test`);
    expect(((await call('GET', '/notification-channels')).body.items as Json[])[0]).toMatchObject({
      failing: false,
      lastError: null,
    });
  });

  test('the job sends each notification to the channels that take its kind, and retries a 5xx', async () => {
    const make = async (topic: string, reminderKinds: string[]) =>
      call('POST', '/notification-channels', { kind: 'ntfy', name: topic, server: base, topic, reminderKinds });
    await make('standalones', ['standalone']);
    await make('events', ['event']);
    const off = await make('off', ['standalone']);
    await call('PATCH', `/notification-channels/${off.body.id}`, { enabled: false });
    const now = new Date();
    const at = new Date(now.getTime() - 60_000).toISOString();
    expect((await call('POST', '/reminders', { title: 'Pills', at, tz: 'UTC', rrule: null })).status).toBe(201);

    status = 500;
    const senders = reminderSenders(noPush, notify);
    expect(await deliverReminders(t.db, senders, now)).toMatchObject({ notified: 1, sent: 0, failed: 0 });
    expect(hits.map((h) => JSON.parse(h.body).topic)).toEqual(['standalones']);
    const [delivery] = await t.db.select().from(schema.notificationDeliveries);
    expect(delivery).toMatchObject({ status: 'pending', attempts: 1 });

    status = 200;
    const later = new Date(now.getTime() + 2 * 60_000);
    expect(await deliverReminders(t.db, senders, later)).toMatchObject({ notified: 0, sent: 1 });
    expect(JSON.parse(hits[1]?.body ?? '{}')).toMatchObject({ topic: 'standalones', title: 'Pills' });
  });

  test('a channel removed after queueing fails its delivery without sending', async () => {
    await call('POST', '/notification-channels', { kind: 'ntfy', name: 'N', server: base, topic: 'a' });
    const now = new Date();
    await call('POST', '/reminders', {
      title: 'Call',
      at: new Date(now.getTime() - 60_000).toISOString(),
      tz: 'UTC',
      rrule: null,
    });
    const senders = reminderSenders(noPush, notify);
    // The first try fails (the server is down), so the delivery waits to retry.
    status = 503;
    expect(await deliverReminders(t.db, senders, now)).toMatchObject({ notified: 1, sent: 0 });
    status = 200;
    await t.db.delete(schema.notificationChannels);
    hits.length = 0;
    expect(await deliverReminders(t.db, senders, new Date(now.getTime() + 2 * 60_000))).toMatchObject({ failed: 1 });
    expect(hits).toHaveLength(0);
  });
});
