import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ICS_LIMITS } from '@homa/core';
import { schema } from '@homa/db';
import { eq } from 'drizzle-orm';
import { createApp } from '@/http';
import { freshDb, testAuth, testDatabaseUrl } from '@/testing';

type Json = Record<string, unknown>;

// A weekly London stand-up across the clock change (29 March 2026): the 30 March one moved to
// 10:00, the 6 April one cancelled; plus a single UTC event.
const standup = (summary = 'Stand-up'): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:standup@example.com',
    `SUMMARY:${summary}`,
    'DTSTART;TZID=Europe/London:20260316T090000',
    'DTEND;TZID=Europe/London:20260316T091500',
    'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=5',
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:standup@example.com',
    'RECURRENCE-ID;TZID=Europe/London:20260330T090000',
    'DTSTART;TZID=Europe/London:20260330T100000',
    'DTEND;TZID=Europe/London:20260330T101500',
    `SUMMARY:${summary}`,
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:standup@example.com',
    'RECURRENCE-ID;TZID=Europe/London:20260406T090000',
    'STATUS:CANCELLED',
    'DTSTART;TZID=Europe/London:20260406T090000',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:dentist@example.com',
    'SUMMARY:Dentist',
    'DTSTART:20260318T140000Z',
    'DTEND:20260318T150000Z',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:broken@example.com',
    'SUMMARY:No start',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

describe.skipIf(!testDatabaseUrl)('ICS import and JSON export', () => {
  let t: Awaited<ReturnType<typeof freshDb>>;
  let app: ReturnType<typeof createApp>;
  let ada = '';
  let bob = '';
  let adaCalendar = '';
  let bobCalendar = '';

  const req = (method: string, path: string, cookie: string, body?: string, type = 'text/calendar') =>
    app.request(`/api${path}`, {
      method,
      headers: { 'content-type': type, origin: 'http://localhost:3000', cookie },
      body,
    });
  const importInto = async (calendarId: string, ics: string, cookie = ada) => {
    const res = await req('POST', `/calendars/${calendarId}/import`, cookie, ics);
    return { status: res.status, body: (await res.json()) as Json };
  };
  const occurrences = async (cookie = ada) =>
    (await (await req('GET', '/occurrences?from=2026-03-01T00:00:00Z&to=2026-05-01T00:00:00Z', cookie)).json()) as {
      start: string;
      summary: string;
      overridden: boolean;
    }[];
  const signUp = async (email: string) => {
    const res = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email, password: 'correct horse battery', name: 'x' }),
    });
    return res.headers.get('set-cookie')?.split(';')[0] ?? '';
  };
  const firstCalendar = async (cookie: string) =>
    String(((await (await req('GET', '/calendars', cookie)).json()) as Json[])[0]?.id);

  beforeAll(async () => {
    t = await freshDb();
    app = createApp({ db: t.db, auth: testAuth(t.db) });
    ada = await signUp('ada@example.com');
    bob = await signUp('bob@example.com');
    adaCalendar = await firstCalendar(ada);
    bobCalendar = await firstCalendar(bob);
  });
  afterAll(() => t.drop());

  test('imports events with overrides and cancellations, and fills the instance cache', async () => {
    const { status, body } = await importInto(adaCalendar, standup());
    expect(status).toBe(200);
    expect(body).toEqual({
      imported: 2,
      updated: 0,
      skipped: 1,
      warnings: ['Event "broken@example.com" skipped: no DTSTART'],
    });
    expect((await occurrences()).map((o) => [o.start, o.summary, o.overridden])).toEqual([
      ['2026-03-16T09:00:00.000Z', 'Stand-up', false],
      ['2026-03-18T14:00:00.000Z', 'Dentist', false],
      ['2026-03-23T09:00:00.000Z', 'Stand-up', false],
      ['2026-03-30T09:00:00.000Z', 'Stand-up', true],
      ['2026-04-13T08:00:00.000Z', 'Stand-up', false],
    ]);
  });

  test('importing again updates by UID instead of duplicating', async () => {
    const { body } = await importInto(adaCalendar, standup('Daily'));
    expect(body).toMatchObject({ imported: 0, updated: 2, skipped: 1 });
    const occ = await occurrences();
    expect(occ).toHaveLength(5);
    expect(occ.filter((o) => o.summary === 'Daily')).toHaveLength(4);
    const overrides = await t.db.select().from(schema.eventOverrides);
    expect(overrides).toHaveLength(1);
    // The same file in another calendar is a separate copy.
    const other = await req('POST', '/calendars', ada, JSON.stringify({ name: 'Other' }), 'application/json');
    const otherId = String(((await other.json()) as Json).id);
    expect((await importInto(otherId, standup())).body).toMatchObject({ imported: 2, updated: 0 });
    await t.db.delete(schema.calendars).where(eq(schema.calendars.id, otherId));
  });

  test('updating by UID keeps travel time, and drops it when the event becomes all-day', async () => {
    const trip = (dates: string[]): string =>
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:trip@example.com',
        'SUMMARY:Trip',
        ...dates,
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');
    const timed = trip(['DTSTART:20260320T090000Z', 'DTEND:20260320T100000Z']);
    expect((await importInto(adaCalendar, timed)).status).toBe(200);
    const byUid = eq(schema.events.uid, 'trip@example.com');
    await t.db.update(schema.events).set({ travelMinutes: 20 }).where(byUid);
    expect((await importInto(adaCalendar, timed)).status).toBe(200);
    expect((await t.db.select().from(schema.events).where(byUid))[0]?.travelMinutes).toBe(20);
    expect(
      (await importInto(adaCalendar, trip(['DTSTART;VALUE=DATE:20260320', 'DTEND;VALUE=DATE:20260321']))).status,
    ).toBe(200);
    expect((await t.db.select().from(schema.events).where(byUid))[0]?.travelMinutes).toBeNull();
    await t.db.delete(schema.events).where(byUid);
  });

  test("you can't import into someone else's calendar, or read theirs", async () => {
    expect((await importInto(adaCalendar, standup(), bob)).status).toBe(404);
    expect((await importInto('00000000-0000-4000-8000-000000000000', standup(), bob)).status).toBe(404);
    expect(await occurrences(bob)).toEqual([]);
    expect((await importInto(bobCalendar, standup(), '')).status).toBe(401);
  });

  test('broken and oversized files are 400s with a reason', async () => {
    const bad = await importInto(adaCalendar, 'hello');
    expect(bad.status).toBe(400);
    expect(String(bad.body.error)).toContain('Not a valid iCalendar file');

    const big = await importInto(
      adaCalendar,
      `BEGIN:VCALENDAR\r\nX-PAD:${'x'.repeat(ICS_LIMITS.maxBytes)}\r\nEND:VCALENDAR`,
    );
    expect(big.status).toBe(400);
    expect(String(big.body.error)).toContain('larger than 5 MB');

    const event = ['BEGIN:VEVENT', 'UID:x', 'END:VEVENT'];
    const many = Array.from({ length: ICS_LIMITS.maxComponents }, () => event).flat();
    const crowded = await importInto(adaCalendar, ['BEGIN:VCALENDAR', ...many, 'END:VCALENDAR'].join('\r\n'));
    expect(crowded.status).toBe(400);
    expect(String(crowded.body.error)).toContain('components');
  });

  test('a file that would fill the cache is rolled back whole', async () => {
    const minutely = (i: number) => [
      'BEGIN:VEVENT',
      `UID:busy-${i}`,
      'DTSTART:20261201T000000Z',
      'DTEND:20261201T000030Z',
      'RRULE:FREQ=MINUTELY',
      'END:VEVENT',
    ];
    const ics = ['BEGIN:VCALENDAR', ...Array.from({ length: 21 }, (_, i) => minutely(i)).flat(), 'END:VCALENDAR'];
    const res = await importInto(bobCalendar, ics.join('\r\n'), bob);
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain('occurrences');
    const bobs = await t.db.select().from(schema.events).where(eq(schema.events.calendarId, bobCalendar));
    expect(bobs).toEqual([]);
  }, 60_000);

  test('export has only your own data, with recurrence and overrides', async () => {
    expect((await importInto(bobCalendar, standup('Bob only'), bob)).status).toBe(200);
    const res = await req('GET', '/export', ada);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="homa-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    const doc = (await res.json()) as {
      version: number;
      settings: Json;
      calendars: Json[];
      events: (Json & { overrides: Json[] })[];
    };
    expect(doc.version).toBe(1);
    expect(doc.settings).toEqual({
      homeTz: null,
      secondaryCalendar: 'none',
      weekStart: null,
      workWeekDays: null,
      defaultReminderMinutes: 10,
      sharingPreset: 'private',
    });
    expect(doc.calendars.map((c) => c.id)).toEqual([adaCalendar]);
    expect(doc.events.map((e) => e.summary).sort()).toEqual(['Daily', 'Dentist']);
    const series = doc.events.find((e) => e.uid === 'standup@example.com');
    expect(series).toMatchObject({
      rrule: 'FREQ=WEEKLY;COUNT=5;BYDAY=MO',
      tz: 'Europe/London',
      exdates: ['2026-04-06T08:00:00.000Z'],
      rdates: [],
      overrides: [
        {
          recurrenceId: '2026-03-30T08:00:00.000Z',
          start: '2026-03-30T09:00:00.000Z',
          end: '2026-03-30T09:15:00.000Z',
          summary: null,
          description: null,
          location: null,
        },
      ],
    });
    expect(JSON.stringify(doc)).not.toContain('Bob only');
    expect((await req('GET', '/export', '')).status).toBe(401);
  });
});
