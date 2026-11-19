import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { HORIZON_DAYS } from '@homa/core';
import { schema } from '@homa/db';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';
import { extendHorizon } from './instance-cache';

type Json = Record<string, unknown>;
type Occ = { eventId: string; recurrenceId: string; start: string; summary: string; overridden: boolean };

describe.skipIf(!testDatabaseUrl)('calendars and events', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  let cookie = '';
  let calendarId = '';

  const call = async (method: string, path: string, body?: unknown, as = cookie) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie: as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (res.status === 204 ? {} : await res.json()) as Json & Json[] };
  };
  const occurrences = async (from: string, to: string) =>
    (await call('GET', `/occurrences?from=${from}&to=${to}`)).body as unknown as Occ[];
  const signUp = async (email: string) => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'correct horse battery', name: 'x' }),
    });
    return res.headers.get('set-cookie')?.split(';')[0] ?? '';
  };

  // Weekly Monday 09:00 London stand-up from 16 March 2026, five times, across the clock change.
  const standup = () => ({
    calendarId,
    summary: 'Stand-up',
    start: '2026-03-16T09:00:00Z',
    end: '2026-03-16T09:15:00Z',
    tz: 'Europe/London',
    rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=5',
  });
  const march = ['2026-03-01T00:00:00Z', '2026-05-01T00:00:00Z'] as const;

  beforeAll(async () => {
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db) });
    cookie = await signUp('ada@example.com');
  });
  afterEach(() => t.db.delete(schema.events));
  afterAll(() => t.drop());

  test('routes need a session', async () => {
    expect((await call('GET', '/calendars', undefined, '')).status).toBe(401);
  });

  test('a new account has a Personal calendar', async () => {
    const { body } = await call('GET', '/calendars');
    expect(body.map((c) => c.name)).toEqual(['Personal']);
    calendarId = String(body[0]?.id);
  });

  test('calendar create, rename and delete', async () => {
    const made = await call('POST', '/calendars', { name: 'Work', color: '#22223b' });
    expect(made.status).toBe(201);
    const renamed = await call('PATCH', `/calendars/${made.body.id}`, { name: 'Office' });
    expect(renamed.body.name).toBe('Office');
    expect((await call('DELETE', `/calendars/${made.body.id}`)).status).toBe(204);
    expect((await call('DELETE', `/calendars/${made.body.id}`)).status).toBe(404);
  });

  test('validation errors are 400s with a message', async () => {
    const bad = await call('POST', '/events', { ...standup(), tz: 'Mars/Olympus', rrule: 'BYDAY=MO' });
    expect(bad.status).toBe(400);
    expect(String(bad.body.error)).toContain('tz');
    expect(String(bad.body.error)).toContain('rrule');
  });

  test('another user cannot see or change your events', async () => {
    const mine = await call('POST', '/events', { ...standup(), rrule: null });
    const bob = await signUp('bob@example.com');
    expect((await call('GET', `/events/${mine.body.id}`, undefined, bob)).status).toBe(404);
    expect((await call('POST', '/events', { ...standup(), rrule: null }, bob)).status).toBe(400); // not bob's calendar
    expect(
      (await call('GET', `/occurrences?from=${march[0]}&to=${march[1]}`, undefined, bob)).body as unknown[],
    ).toEqual([]);
    await call('DELETE', `/events/${mine.body.id}`);
  });

  test('a recurring event expands across the clock change', async () => {
    const made = await call('POST', '/events', standup());
    expect(made.status).toBe(201);
    const occ = await occurrences(...march);
    expect(occ.map((o) => o.start)).toEqual([
      '2026-03-16T09:00:00.000Z',
      '2026-03-23T09:00:00.000Z',
      '2026-03-30T08:00:00.000Z',
      '2026-04-06T08:00:00.000Z',
      '2026-04-13T08:00:00.000Z',
    ]);
    await call('DELETE', `/events/${made.body.id}`);
  });

  test('scope=this changes and deletes single occurrences', async () => {
    const { body: e } = await call('POST', '/events', standup());
    const moved = await call('PATCH', `/events/${e.id}?scope=this&recurrenceId=2026-03-30T08:00:00Z`, {
      summary: 'Stand-up (moved)',
      start: '2026-03-30T09:00:00Z',
    });
    expect(moved.status).toBe(200);
    expect((await call('DELETE', `/events/${e.id}?scope=this&recurrenceId=2026-03-23T09:00:00Z`)).status).toBe(204);
    // Not an occurrence: 400.
    expect((await call('DELETE', `/events/${e.id}?scope=this&recurrenceId=2026-03-24T09:00:00Z`)).status).toBe(400);

    const occ = await occurrences(...march);
    expect(occ.map((o) => [o.start, o.summary, o.overridden])).toEqual([
      ['2026-03-16T09:00:00.000Z', 'Stand-up', false],
      ['2026-03-30T09:00:00.000Z', 'Stand-up (moved)', true],
      ['2026-04-06T08:00:00.000Z', 'Stand-up', false],
      ['2026-04-13T08:00:00.000Z', 'Stand-up', false],
    ]);
    await call('DELETE', `/events/${e.id}`);
  });

  test('scope=following splits the series, carrying COUNT and later overrides over', async () => {
    const { body: e } = await call('POST', '/events', standup());
    await call('PATCH', `/events/${e.id}?scope=this&recurrenceId=2026-04-13T08:00:00Z`, { summary: 'Last one' });
    const split = await call('PATCH', `/events/${e.id}?scope=following&recurrenceId=2026-03-30T08:00:00Z`, {
      summary: 'Stand-up v2',
      start: '2026-03-30T09:30:00+01:00',
      end: '2026-03-30T09:45:00+01:00',
    });
    expect(split.status).toBe(200);
    expect(split.body.id).not.toBe(e.id);
    expect(split.body.rrule).toContain('COUNT=3');

    const occ = await occurrences(...march);
    expect(occ.map((o) => [o.start, o.summary])).toEqual([
      ['2026-03-16T09:00:00.000Z', 'Stand-up'],
      ['2026-03-23T09:00:00.000Z', 'Stand-up'],
      ['2026-03-30T08:30:00.000Z', 'Stand-up v2'],
      ['2026-04-06T08:30:00.000Z', 'Stand-up v2'],
      ['2026-04-13T08:30:00.000Z', 'Last one'],
    ]);
    await call('DELETE', `/events/${e.id}`);
    await call('DELETE', `/events/${split.body.id}`);
  });

  test('scope=all moves the whole series with its exceptions; scope=following deletes the tail', async () => {
    const { body: e } = await call('POST', '/events', standup());
    await call('DELETE', `/events/${e.id}?scope=this&recurrenceId=2026-03-23T09:00:00Z`);
    await call('PATCH', `/events/${e.id}`, { start: '2026-03-16T10:00:00Z', end: '2026-03-16T10:15:00Z' });
    let occ = await occurrences(...march);
    expect(occ.map((o) => o.start)).toEqual([
      '2026-03-16T10:00:00.000Z',
      '2026-03-30T09:00:00.000Z',
      '2026-04-06T09:00:00.000Z',
      '2026-04-13T09:00:00.000Z',
    ]);
    await call('DELETE', `/events/${e.id}?scope=following&recurrenceId=2026-04-06T09:00:00Z`);
    occ = await occurrences(...march);
    expect(occ).toHaveLength(2);
    await call('DELETE', `/events/${e.id}`);
  });

  test('ranges past the cached horizon expand on the fly, and the nightly job extends it', async () => {
    const { body: e } = await call('POST', '/events', {
      ...standup(),
      start: new Date().toISOString(),
      end: new Date(Date.now() + 900_000).toISOString(),
      rrule: 'FREQ=DAILY',
    });
    const far = new Date(Date.now() + (HORIZON_DAYS + 10) * 86_400_000);
    const from = new Date(far.getTime() - 5 * 86_400_000).toISOString();
    expect(await occurrences(from, far.toISOString())).toHaveLength(5);

    // Pretend a year has passed: the job re-expands, and the same answer now comes from the cache.
    expect(await extendHorizon(t.db, new Date(Date.now() + 365 * 86_400_000))).toBeGreaterThan(0);
    const cached = await t.db.$count(schema.eventInstances);
    expect(cached).toBeGreaterThan(HORIZON_DAYS + 300);
    expect(await occurrences(from, far.toISOString())).toHaveLength(5);
    await call('DELETE', `/events/${e.id}`);
  });

  test('range queries are bounded', async () => {
    expect((await call('GET', '/occurrences?from=2026-01-01T00:00:00Z&to=2028-01-01T00:00:00Z')).status).toBe(400);
  });
});
