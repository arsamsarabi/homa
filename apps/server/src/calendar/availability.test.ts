import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';

type Json = Record<string, unknown>;

describe.skipIf(!testDatabaseUrl)('POST /api/availability', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  let ada = '';
  let bob = '';
  let adaId = '';
  let bobId = '';
  let caraId = '';
  let adaCalendar = '';
  let adaHidden = '';

  const call = async (method: string, path: string, cookie: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (res.status === 204 ? {} : await res.json()) as Json & Json[] };
  };
  const signUp = async (email: string, name: string) => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'correct horse battery', name }),
    });
    const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
    const session = await app.request('/api/auth/get-session', {
      headers: { origin: 'http://localhost:3000', cookie },
    });
    const json = (await session.json()) as { user?: { id: string } };
    return { cookie, id: json.user?.id ?? '' };
  };

  beforeAll(async () => {
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db) });
    const a = await signUp('ada-avail@example.com', 'Ada');
    const b = await signUp('bob-avail@example.com', 'Bob');
    const c = await signUp('cara-avail@example.com', 'Cara');
    ada = a.cookie;
    bob = b.cookie;
    adaId = a.id;
    bobId = b.id;
    caraId = c.id;
    adaCalendar = String((await call('GET', '/calendars', ada)).body[0]?.id);
    const hidden = await call('POST', '/calendars', ada, { name: 'Hidden', color: '#112233' });
    expect(hidden.status).toBe(201);
    adaHidden = String(hidden.body.id);
    expect((await call('PATCH', `/calendars/${adaHidden}`, ada, { hidden: true })).status).toBe(200);
  });
  afterAll(() => t.drop());

  test('unknown user ids are 400; more than 50 people or 92 days are 400', async () => {
    expect(
      (
        await call('POST', '/availability', bob, {
          from: '2026-12-01T00:00:00Z',
          to: '2026-12-02T00:00:00Z',
          userIds: ['not-a-real-user'],
        })
      ).status,
    ).toBe(400);

    const tooMany = Array.from({ length: 51 }, (_, i) => (i === 0 ? bobId : `${bobId}-${i}`));
    expect(
      (
        await call('POST', '/availability', bob, {
          from: '2026-12-01T00:00:00Z',
          to: '2026-12-02T00:00:00Z',
          userIds: tooMany,
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await call('POST', '/availability', bob, {
          from: '2026-12-01T00:00:00Z',
          to: '2027-03-04T00:00:00Z',
          userIds: [bobId],
        })
      ).status,
    ).toBe(400);
  });

  test('caller sees own busy including hidden calendars; all-day does not count', async () => {
    const timed = await call('POST', '/events', ada, {
      calendarId: adaHidden,
      summary: 'Secret focus',
      start: '2026-12-01T10:00:00Z',
      end: '2026-12-01T11:00:00Z',
      tz: 'UTC',
    });
    expect(timed.status).toBe(201);
    const allDay = await call('POST', '/events', ada, {
      calendarId: adaCalendar,
      summary: 'Holiday',
      start: '2026-12-01T00:00:00Z',
      end: '2026-12-02T00:00:00Z',
      allDay: true,
      tz: 'UTC',
    });
    expect(allDay.status).toBe(201);

    const res = await call('POST', '/availability', ada, {
      from: '2026-12-01T00:00:00Z',
      to: '2026-12-02T00:00:00Z',
      userIds: [adaId],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      from: '2026-12-01T00:00:00.000Z',
      to: '2026-12-02T00:00:00.000Z',
      people: [
        {
          userId: adaId,
          shared: true,
          busy: [{ start: '2026-12-01T10:00:00.000Z', end: '2026-12-01T11:00:00.000Z' }],
        },
      ],
    });
    const busy = (res.body.people as Json[])[0]?.busy as Json[];
    expect(JSON.stringify(busy)).not.toContain('Secret');
    expect(JSON.stringify(busy)).not.toContain(adaHidden);
  });

  test('unshared person is shared:false; freebusy grant returns busy times only', async () => {
    const none = await call('POST', '/availability', bob, {
      from: '2026-12-01T00:00:00Z',
      to: '2026-12-02T00:00:00Z',
      userIds: [adaId, caraId],
    });
    expect(none.status).toBe(200);
    expect(none.body.people).toEqual([
      { userId: adaId, shared: false, busy: [] },
      { userId: caraId, shared: false, busy: [] },
    ]);

    expect(
      (
        await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
          defaultAccess: null,
          grants: [{ userId: bobId, level: 'freebusy' }],
        })
      ).status,
    ).toBe(200);
    // Timed event on the shared (visible) calendar.
    const sharedEvent = await call('POST', '/events', ada, {
      calendarId: adaCalendar,
      summary: 'Standup',
      start: '2026-12-01T14:00:00Z',
      end: '2026-12-01T14:30:00Z',
      tz: 'UTC',
    });
    expect(sharedEvent.status).toBe(201);

    const res = await call('POST', '/availability', bob, {
      from: '2026-12-01T00:00:00Z',
      to: '2026-12-02T00:00:00Z',
      userIds: [adaId],
    });
    expect(res.status).toBe(200);
    expect(res.body.people).toEqual([
      {
        userId: adaId,
        shared: true,
        // Hidden calendar is not shared with Bob, so only the standup on adaCalendar.
        // All-day holiday on adaCalendar is ignored.
        busy: [{ start: '2026-12-01T14:00:00.000Z', end: '2026-12-01T14:30:00.000Z' }],
      },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('Standup');
  });

  test('overlapping busy intervals are merged and sorted', async () => {
    expect(
      (
        await call('PUT', `/calendars/${adaCalendar}/grants`, ada, {
          defaultAccess: null,
          grants: [{ userId: bobId, level: 'read' }],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call('POST', '/events', ada, {
          calendarId: adaCalendar,
          summary: 'A',
          start: '2026-12-03T09:00:00Z',
          end: '2026-12-03T10:00:00Z',
          tz: 'UTC',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call('POST', '/events', ada, {
          calendarId: adaCalendar,
          summary: 'B',
          start: '2026-12-03T10:00:00Z',
          end: '2026-12-03T11:00:00Z',
          tz: 'UTC',
        })
      ).status,
    ).toBe(201);

    const res = await call('POST', '/availability', bob, {
      from: '2026-12-03T00:00:00Z',
      to: '2026-12-04T00:00:00Z',
      userIds: [adaId],
    });
    expect(res.status).toBe(200);
    expect((res.body.people as Json[])[0]?.busy).toEqual([
      { start: '2026-12-03T09:00:00.000Z', end: '2026-12-03T11:00:00.000Z' },
    ]);
  });
  test('travel time before an event is busy, also for an event just after the range', async () => {
    const travel = async (start: string, end: string, travelMinutes: number) =>
      expect(
        (
          await call('POST', '/events', ada, {
            calendarId: adaCalendar,
            summary: 'Trip',
            start,
            end,
            tz: 'UTC',
            travelMinutes,
          })
        ).status,
      ).toBe(201);
    await travel('2026-12-10T12:00:00Z', '2026-12-10T13:00:00Z', 30);
    await travel('2026-12-11T00:30:00Z', '2026-12-11T01:00:00Z', 60);

    const res = await call('POST', '/availability', bob, {
      from: '2026-12-10T00:00:00Z',
      to: '2026-12-11T00:00:00Z',
      userIds: [adaId],
    });
    expect(res.status).toBe(200);
    expect((res.body.people as Json[])[0]?.busy).toEqual([
      { start: '2026-12-10T11:30:00.000Z', end: '2026-12-10T13:00:00.000Z' },
      { start: '2026-12-10T23:30:00.000Z', end: '2026-12-11T00:00:00.000Z' },
    ]);
  });
});
