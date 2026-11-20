// Reminders end to end on a throwaway database: the API (event reminders, standalone reminders,
// notifications, push subscriptions, ownership), the delivery job (recurring series across a
// clock change, idempotency, snooze, done) and web push against a fake push service.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { schema } from '@homa/db';
import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import { writeIcsEvents } from '@/calendar';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';
import type { Senders } from './channels';
import { deliverReminders } from './delivery';
import { type PushSettings, sendPush } from './push';

type Json = Record<string, unknown>;

describe.skipIf(!testDatabaseUrl)('reminders', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  let ada = '';
  let bob = '';
  let calendarId = '';
  const keys = webpush.generateVAPIDKeys();
  const push: PushSettings = {
    allowPrivate: true,
    vapid: async () => ({ ...keys, subject: 'mailto:admin@example.com' }),
  };

  // A fake push service: records each POST and answers with `status`.
  const received: { path: string; headers: Headers }[] = [];
  let status = 201;
  const pushService = Bun.serve({
    port: 0,
    fetch: async (req: Request): Promise<Response> => {
      received.push({ path: new URL(req.url).pathname, headers: req.headers });
      await req.arrayBuffer();
      return new Response(null, { status });
    },
  });
  const endpoint = (name: string): string => `http://127.0.0.1:${pushService.port}/push/${name}`;
  // A real browser key pair, so web-push can encrypt to it.
  const browserKey = (() => {
    const { publicKey } = webpush.generateVAPIDKeys();
    return { p256dh: publicKey, auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url') };
  })();

  const call = async (method: string, path: string, body?: unknown, as = ada) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie: as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (res.status === 204 ? {} : await res.json()) as Json & Json[] };
  };
  const signUp = async (email: string) => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'correct horse battery', name: 'x' }),
    });
    return res.headers.get('set-cookie')?.split(';')[0] ?? '';
  };
  const sent: string[] = [];
  const fakeSenders: Senders = {
    push: async (_db, n) => {
      sent.push(n.title);
    },
  };
  const notifications = () => t.db.select().from(schema.notifications);

  // Weekly Monday 09:00 London stand-up from 16 March 2026, five times, across the clock change.
  const standup = (extra: Json = {}) => ({
    calendarId,
    summary: 'Stand-up',
    start: '2026-03-16T09:00:00Z',
    end: '2026-03-16T09:15:00Z',
    tz: 'Europe/London',
    rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=5',
    ...extra,
  });

  beforeAll(async () => {
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db), push });
    ada = await signUp('ada@example.com');
    bob = await signUp('bob@example.com');
    calendarId = String(((await call('GET', '/calendars')).body as Json[])[0]?.id);
  });
  beforeEach(async () => {
    await t.db.delete(schema.events);
    await t.db.delete(schema.reminders);
    await t.db.delete(schema.notifications);
    await t.db.delete(schema.pushSubscriptions);
    sent.length = 0;
    received.length = 0;
    status = 201;
  });
  afterAll(async () => {
    await pushService.stop();
    await t.drop();
  });

  describe('API', () => {
    test('routes need a session', async () => {
      expect((await call('GET', '/notifications', undefined, '')).status).toBe(401);
      expect((await call('GET', '/reminders', undefined, '')).status).toBe(401);
    });

    test('an event keeps its reminders, sorted and without duplicates', async () => {
      const created = await call('POST', '/events', standup({ reminders: [1440, 10, 10] }));
      expect(created.status).toBe(201);
      expect(created.body.reminders).toEqual([10, 1440]);
      const id = String(created.body.id);
      expect((await call('PUT', `/events/${id}/reminders`, { reminders: [0] })).body.reminders).toEqual([0]);
      expect((await call('GET', `/events/${id}`)).body.reminders).toEqual([0]);
      expect((await call('PUT', `/events/${id}/reminders`, { reminders: [1, 2, 3, 4, 5, 6] })).status).toBe(400);
      expect((await call('PUT', `/events/${id}/reminders`, { reminders: [40_321] })).status).toBe(400);
    });

    test("another user's event, reminder or notification is a 404", async () => {
      const id = String((await call('POST', '/events', standup())).body.id);
      expect((await call('PUT', `/events/${id}/reminders`, { reminders: [5] }, bob)).status).toBe(404);
      const r = await call('POST', '/reminders', { title: 'Call mum', at: '2030-01-01T17:00:00Z', tz: 'UTC' });
      const rid = String(r.body.id);
      expect((await call('PATCH', `/reminders/${rid}`, { title: 'x' }, bob)).status).toBe(404);
      expect((await call('DELETE', `/reminders/${rid}`, undefined, bob)).status).toBe(404);
      expect((await call('GET', '/reminders', undefined, bob)).body as unknown).toEqual([]);
      await deliverReminders(t.db, fakeSenders, new Date('2030-01-01T17:00:10Z'));
      const [n] = await notifications();
      expect((await call('POST', `/notifications/${n?.id}/done`, undefined, bob)).status).toBe(404);
      expect((await call('POST', `/notifications/${n?.id}/snooze`, { minutes: 5 }, bob)).status).toBe(404);
      expect(((await call('GET', '/notifications', undefined, bob)).body.items as Json[]).length).toBe(0);
    });

    test('standalone reminders: create, list, change and delete', async () => {
      const r = await call('POST', '/reminders', {
        title: 'Water the plants',
        at: '2030-01-06T08:00:00Z',
        tz: 'Europe/London',
        rrule: 'FREQ=WEEKLY',
      });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({
        title: 'Water the plants',
        rrule: 'FREQ=WEEKLY',
        nextFireAt: '2030-01-06T08:00:00.000Z',
      });
      const id = String(r.body.id);
      expect(
        (
          await call('POST', '/reminders', {
            title: 'x',
            at: '2030-01-01T00:00:00Z',
            tz: 'UTC',
            rrule: 'FREQ=MINUTELY',
          })
        ).status,
      ).toBe(400);
      const changed = await call('PATCH', `/reminders/${id}`, { at: '2030-02-01T09:00:00Z', rrule: null });
      expect(changed.body).toMatchObject({ rrule: null, nextFireAt: '2030-02-01T09:00:00.000Z' });
      expect(((await call('GET', '/reminders')).body as Json[]).map((x) => x.id)).toEqual([id]);
      expect((await call('DELETE', `/reminders/${id}`)).status).toBe(204);
      expect((await call('GET', '/reminders')).body as unknown).toEqual([]);
    });

    test('push: the key, subscribing (https only) and unsubscribing', async () => {
      expect((await call('GET', '/push/key')).body as unknown).toEqual({ publicKey: keys.publicKey });
      expect((await call('POST', '/push/subscriptions', { endpoint: 'ftp://x/y', keys: browserKey })).status).toBe(400);
      expect((await call('POST', '/push/subscriptions', { endpoint: endpoint('a'), keys: browserKey })).status).toBe(
        204,
      );
      // The same browser signing in as someone else moves the subscription.
      expect(
        (await call('POST', '/push/subscriptions', { endpoint: endpoint('a'), keys: browserKey }, bob)).status,
      ).toBe(204);
      const subs = await t.db.select().from(schema.pushSubscriptions);
      expect(subs).toHaveLength(1);
      await call('DELETE', '/push/subscriptions', { endpoint: endpoint('a') }, bob);
      expect(await t.db.select().from(schema.pushSubscriptions)).toHaveLength(0);
    });
  });

  describe('the delivery job', () => {
    test('a weekly series fires each occurrence, a wall-clock day before across the clock change', async () => {
      await call('POST', '/push/subscriptions', { endpoint: endpoint('a'), keys: browserKey });
      await call('POST', '/events', standup({ reminders: [1440] }));
      // Monday 30 March 09:00 BST (08:00Z): "1 day before" is 09:00 BST on Sunday the 29th.
      expect(await deliverReminders(t.db, fakeSenders, new Date('2026-03-29T07:59:00Z'))).toMatchObject({
        notified: 0,
      });
      expect(await deliverReminders(t.db, fakeSenders, new Date('2026-03-29T08:00:30Z'))).toMatchObject({
        notified: 1,
        sent: 1,
      });
      // GMT week: Monday 23 March 09:00 GMT → Sunday 22nd 09:00Z.
      expect(await deliverReminders(t.db, fakeSenders, new Date('2026-03-22T09:00:00Z'))).toMatchObject({
        notified: 1,
      });
      const rows = await notifications();
      expect(rows.map((n) => n.fireAt.toISOString()).sort()).toEqual([
        '2026-03-22T09:00:00.000Z',
        '2026-03-29T08:00:00.000Z',
      ]);
      expect(rows.map((n) => n.occurrenceStart.toISOString()).sort()).toEqual([
        '2026-03-23T09:00:00.000Z',
        '2026-03-30T08:00:00.000Z',
      ]);
      expect(sent).toEqual(['Stand-up', 'Stand-up']);
    });

    test('one occurrence gets one notification, across reruns and overlapping workers', async () => {
      await call('POST', '/push/subscriptions', { endpoint: endpoint('a'), keys: browserKey });
      await call('POST', '/events', standup({ reminders: [10] }));
      const now = new Date('2026-03-16T08:50:20Z');
      await Promise.all([1, 2, 3].map(() => deliverReminders(t.db, fakeSenders, now)));
      await deliverReminders(t.db, fakeSenders, new Date(now.getTime() + 60_000));
      expect(await notifications()).toHaveLength(1);
      expect(sent).toEqual(['Stand-up']);
      expect(await t.db.select().from(schema.notificationDeliveries)).toMatchObject([{ status: 'sent' }]);
    });

    test('a reminder more than an hour late is skipped; a moved occurrence reminds again', async () => {
      const id = String((await call('POST', '/events', standup({ reminders: [10] }))).body.id);
      expect(await deliverReminders(t.db, fakeSenders, new Date('2026-03-16T10:00:00Z'))).toMatchObject({
        notified: 0,
      });
      await deliverReminders(t.db, fakeSenders, new Date('2026-03-23T08:51:00Z'));
      // That occurrence moves to 11:00: its new fire time is a new notification.
      await call('PATCH', `/events/${id}?scope=this&recurrenceId=2026-03-23T09:00:00Z`, {
        start: '2026-03-23T11:00:00Z',
        end: '2026-03-23T11:15:00Z',
      });
      await deliverReminders(t.db, fakeSenders, new Date('2026-03-23T10:50:00Z'));
      expect((await notifications()).map((n) => n.fireAt.toISOString()).sort()).toEqual([
        '2026-03-23T08:50:00.000Z',
        '2026-03-23T10:50:00.000Z',
      ]);
    });

    test('snooze brings a notification back, unread and sent again; done removes it', async () => {
      await call('POST', '/push/subscriptions', { endpoint: endpoint('a'), keys: browserKey });
      await call('POST', '/events', standup({ reminders: [10] }));
      await deliverReminders(t.db, fakeSenders, new Date('2026-03-16T08:50:00Z'));
      const list = await call('GET', '/notifications');
      expect(list.body.unread).toBe(1);
      const id = String((list.body.items as Json[])[0]?.id);
      await call('POST', '/notifications/read');
      expect((await call('GET', '/notifications')).body.unread).toBe(0);

      await call('POST', `/notifications/${id}/snooze`, { until: '2999-01-01T00:00:00Z' });
      expect((await call('GET', '/notifications')).body.items).toEqual([]);
      await t.db
        .update(schema.notifications)
        .set({ snoozedUntil: new Date('2026-03-16T09:00:00Z') })
        .where(eq(schema.notifications.id, id));
      expect(await deliverReminders(t.db, fakeSenders, new Date('2026-03-16T09:00:30Z'))).toMatchObject({
        resurfaced: 1,
        sent: 1,
      });
      expect(sent).toHaveLength(2);
      expect((await call('GET', '/notifications')).body.unread).toBe(1);

      expect((await call('POST', `/notifications/${id}/done`)).status).toBe(200);
      expect((await call('GET', '/notifications')).body as unknown).toEqual({ items: [], unread: 0 });
    });

    test('a daily standalone reminder repeats in wall time; done on a one-off finishes it', async () => {
      const daily = await call('POST', '/reminders', {
        title: 'Pills',
        at: '2030-03-30T09:00:00Z',
        tz: 'Europe/London',
        rrule: 'FREQ=DAILY',
      });
      await deliverReminders(t.db, fakeSenders, new Date('2030-03-30T09:00:10Z'));
      expect((await call('GET', '/reminders')).body).toMatchObject([
        { id: daily.body.id, nextFireAt: '2030-03-31T08:00:00.000Z' }, // 09:00 BST
      ]);
      await deliverReminders(t.db, fakeSenders, new Date('2030-03-31T08:00:10Z'));
      expect(await notifications()).toHaveLength(2);

      const once = await call('POST', '/reminders', { title: 'Call mum', at: '2030-03-31T17:00:00Z', tz: 'UTC' });
      await deliverReminders(t.db, fakeSenders, new Date('2030-03-31T17:00:05Z'));
      const n = (await notifications()).find((x) => x.reminderId === once.body.id);
      await call('POST', `/notifications/${n?.id}/done`);
      expect(((await call('GET', '/reminders')).body as Json[]).map((x) => x.id)).toEqual([daily.body.id]);
    });

    test('a channel that keeps failing retries with backoff, then fails', async () => {
      await call('POST', '/push/subscriptions', { endpoint: endpoint('a'), keys: browserKey });
      await call('POST', '/events', standup({ reminders: [10] }));
      const failing: Senders = {
        push: async () => {
          throw new Error('down');
        },
      };
      let now = new Date('2026-03-16T08:50:00Z');
      for (let i = 0; i < 8; i++) {
        await deliverReminders(t.db, failing, now);
        now = new Date(now.getTime() + 61 * 60_000);
      }
      expect(await t.db.select().from(schema.notificationDeliveries)).toMatchObject([
        { status: 'failed', attempts: 8, lastError: 'down' },
      ]);
    });
  });

  describe('web push', () => {
    const notification = async () => {
      await call('POST', '/events', standup({ reminders: [10] }));
      await deliverReminders(t.db, {}, new Date('2026-03-16T08:50:00Z'));
      const [n] = await notifications();
      if (!n) throw new Error('no notification');
      return n;
    };

    test('signs and encrypts for each browser', async () => {
      await call('POST', '/push/subscriptions', { endpoint: endpoint('a'), keys: browserKey });
      await call('POST', '/push/subscriptions', { endpoint: endpoint('b'), keys: browserKey });
      await sendPush(t.db, push, await notification());
      expect(received.map((r) => r.path).sort()).toEqual(['/push/a', '/push/b']);
      expect(received[0]?.headers.get('authorization')).toStartWith('vapid t=');
      expect(received[0]?.headers.get('content-encoding')).toBe('aes128gcm');
      expect(received[0]?.headers.get('urgency')).toBe('high');
    });

    test('a gone subscription (410) is removed; a 503 is retried; a 400 is refused', async () => {
      await call('POST', '/push/subscriptions', { endpoint: endpoint('a'), keys: browserKey });
      const n = await notification();
      status = 503;
      await expect(sendPush(t.db, push, n)).rejects.toMatchObject({ retriable: true });
      status = 400;
      await expect(sendPush(t.db, push, n)).rejects.toMatchObject({ retriable: false });
      status = 410;
      await sendPush(t.db, push, n);
      expect(await t.db.select().from(schema.pushSubscriptions)).toHaveLength(0);
    });

    test('a private endpoint is refused unless private networks are allowed', async () => {
      await call('POST', '/push/subscriptions', { endpoint: endpoint('a'), keys: browserKey });
      await expect(sendPush(t.db, { ...push, allowPrivate: false }, await notification())).rejects.toMatchObject({
        retriable: false,
      });
      expect(received).toHaveLength(0);
    });
  });

  test('pulls leave reminders on read-only calendars alone, and replace them on writable ones', async () => {
    const [user] = await t.db.select().from(schema.users).where(eq(schema.users.email, 'ada@example.com'));
    if (!user) throw new Error('no user');
    const [readOnly] = await t.db
      .insert(schema.calendars)
      .values({ ownerUserId: user.id, name: 'Feed', readOnly: true })
      .returning();
    if (!readOnly) throw new Error('no calendar');
    const event = (reminders: { minutes: number; action: 'display' | 'email' }[]) => ({
      uid: 'feed-1',
      summary: 'Talk',
      description: null,
      location: null,
      start: new Date('2030-01-01T10:00:00Z'),
      end: new Date('2030-01-01T11:00:00Z'),
      allDay: false,
      tz: 'UTC',
      rrule: null,
      exdates: [],
      rdates: [],
      overrides: [],
      reminders,
    });
    const reminders = async (cal: string) => {
      const [e] = await t.db.select().from(schema.events).where(eq(schema.events.calendarId, cal));
      return (await call('GET', `/events/${e?.id}`)).body.reminders;
    };
    await t.db.transaction((tx) =>
      writeIcsEvents(tx, user.id, readOnly.id, [event([{ minutes: 5, action: 'display' }])]),
    );
    expect(await reminders(readOnly.id)).toEqual([]);
    const [e] = await t.db.select().from(schema.events).where(eq(schema.events.calendarId, readOnly.id));
    expect((await call('PUT', `/events/${e?.id}/reminders`, { reminders: [30] })).status).toBe(200);
    await t.db.transaction((tx) => writeIcsEvents(tx, user.id, readOnly.id, [event([])]));
    expect(await reminders(readOnly.id)).toEqual([30]);

    await t.db.transaction((tx) => writeIcsEvents(tx, user.id, calendarId, [event([{ minutes: 5, action: 'email' }])]));
    expect(await reminders(calendarId)).toEqual([5]);
    await t.db.transaction((tx) => writeIcsEvents(tx, user.id, calendarId, [event([])]));
    expect(await reminders(calendarId)).toEqual([]);
  });
});
