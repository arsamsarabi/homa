// Graph recurrence patterns to RRULEs and back, time zones (Windows and IANA names), cancelled
// occurrences, HTML bodies and the RRULEs Outlook can't hold.
import { describe, expect, test } from 'bun:test';
import {
  bodyText,
  type GraphEvent,
  graphBody,
  graphZone,
  instantOf,
  type PatternedRecurrence,
  readSeries,
  recurrenceOf,
  rruleOf,
  UnsupportedRecurrence,
  uidOf,
} from './mapping';

const range = { type: 'noEnd', startDate: '2027-03-01' } as const;
const weekly: PatternedRecurrence = {
  pattern: { type: 'weekly', interval: 2, daysOfWeek: ['monday', 'wednesday'], firstDayOfWeek: 'sunday' },
  range: { type: 'numbered', startDate: '2027-03-01', numberOfOccurrences: 10 },
};

describe('pull: patterns to RRULEs', () => {
  test.each([
    [{ pattern: { type: 'daily', interval: 1 }, range }, 'FREQ=DAILY'],
    [weekly, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;WKST=SU;COUNT=10'],
    [{ pattern: { type: 'absoluteMonthly', interval: 1, dayOfMonth: 15 }, range }, 'FREQ=MONTHLY;BYMONTHDAY=15'],
    [
      { pattern: { type: 'relativeMonthly', interval: 1, daysOfWeek: ['tuesday'], index: 'second' }, range },
      'FREQ=MONTHLY;BYDAY=2TU',
    ],
    [
      {
        pattern: { type: 'relativeMonthly', interval: 1, daysOfWeek: ['monday', 'friday'], index: 'last' },
        range,
      },
      'FREQ=MONTHLY;BYDAY=MO,FR;BYSETPOS=-1',
    ],
    [
      { pattern: { type: 'absoluteYearly', interval: 1, month: 3, dayOfMonth: 21 }, range },
      'FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=21',
    ],
    [
      { pattern: { type: 'relativeYearly', interval: 1, month: 11, daysOfWeek: ['thursday'], index: 'fourth' }, range },
      'FREQ=YEARLY;BYMONTH=11;BYDAY=4TH',
    ],
  ] as [PatternedRecurrence, string][])('%#', (r, rrule) => {
    expect(rruleOf(r, false, 'Europe/London')).toBe(rrule);
  });

  test('an end date ends at the end of that day in the zone, or on the date for all-day series', () => {
    const r: PatternedRecurrence = {
      pattern: { type: 'daily', interval: 1 },
      range: { type: 'endDate', startDate: '2027-07-01', endDate: '2027-07-10' },
    };
    expect(rruleOf(r, false, 'Europe/London')).toBe('FREQ=DAILY;UNTIL=20270710T225959Z');
    expect(rruleOf(r, true, 'UTC')).toBe('FREQ=DAILY;UNTIL=20270710');
  });
});

describe('push: RRULEs to patterns', () => {
  const start = new Date('2027-03-01T09:00:00Z'); // a Monday, 09:00 in London
  test('round trips', () => {
    for (const rrule of [
      'FREQ=DAILY',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;WKST=SU;COUNT=10',
      'FREQ=MONTHLY;BYDAY=2TU',
      'FREQ=MONTHLY;BYDAY=MO,FR;BYSETPOS=-1',
      'FREQ=YEARLY;BYMONTH=11;BYDAY=4TH',
      'FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=21',
    ])
      expect(rruleOf(recurrenceOf(rrule, start, false, 'Europe/London'), false, 'Europe/London')).toBe(rrule);
  });

  test('missing parts come from the start; range from COUNT or UNTIL', () => {
    expect(recurrenceOf('FREQ=WEEKLY', start, false, 'Europe/London')).toEqual({
      pattern: { type: 'weekly', interval: 1, daysOfWeek: ['monday'], firstDayOfWeek: 'monday' },
      range: { type: 'noEnd', startDate: '2027-03-01' },
    });
    expect(recurrenceOf('FREQ=MONTHLY;UNTIL=20270630T225959Z', start, false, 'Europe/London')).toEqual({
      pattern: { type: 'absoluteMonthly', interval: 1, dayOfMonth: 1 },
      range: { type: 'endDate', startDate: '2027-03-01', endDate: '2027-06-30' },
    });
    expect(recurrenceOf('FREQ=YEARLY', start, false, 'Europe/London').pattern).toEqual({
      type: 'absoluteYearly',
      interval: 1,
      dayOfMonth: 1,
      month: 3,
    });
    // "Every weekday" as a daily rule becomes Outlook's weekly one.
    expect(recurrenceOf('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR', start, false, 'UTC').pattern.type).toBe('weekly');
  });

  test.each([
    'FREQ=HOURLY',
    'FREQ=MONTHLY;BYMONTHDAY=-1',
    'FREQ=MONTHLY;BYMONTHDAY=1,15',
    'FREQ=WEEKLY;BYDAY=1MO',
    'FREQ=MONTHLY;BYDAY=1MO,2TU',
    'FREQ=MONTHLY;BYDAY=5MO',
    'FREQ=DAILY;BYHOUR=9,17',
    'FREQ=YEARLY;BYWEEKNO=20',
    'FREQ=MONTHLY;BYSETPOS=1',
  ])('%s is refused', (rrule) => {
    expect(() => recurrenceOf(rrule, start, false, 'UTC')).toThrow(UnsupportedRecurrence);
  });

  test('bodies: wall times with Windows zone names, all-day midnights, RDATEs refused', () => {
    const e = {
      uid: 'u1',
      summary: 'Stand-up',
      description: null,
      location: 'Room 2',
      start,
      end: new Date('2027-03-01T09:15:00Z'),
      allDay: false,
      tz: 'Europe/London',
      rrule: null,
      exdates: [],
      rdates: [],
      overrides: [],
    };
    expect(graphBody(e)).toEqual({
      subject: 'Stand-up',
      body: { contentType: 'text', content: '' },
      location: { displayName: 'Room 2' },
      start: { dateTime: '2027-03-01T09:00:00', timeZone: 'GMT Standard Time' },
      end: { dateTime: '2027-03-01T09:15:00', timeZone: 'GMT Standard Time' },
      isAllDay: false,
    });
    const day = graphBody({
      ...e,
      allDay: true,
      tz: 'UTC',
      start: new Date('2027-04-01T00:00:00Z'),
      end: new Date('2027-04-03T00:00:00Z'),
    });
    expect([day.start, day.end]).toEqual([
      { dateTime: '2027-04-01T00:00:00', timeZone: 'UTC' },
      { dateTime: '2027-04-03T00:00:00', timeZone: 'UTC' },
    ]);
    expect(() => graphBody({ ...e, rrule: 'FREQ=DAILY', rdates: [start] })).toThrow(UnsupportedRecurrence);
    expect(graphZone('Asia/Tehran')).toBe('Iran Standard Time');
    expect(graphZone('Etc/UTC')).toBe('UTC');
  });
});

describe('reading a series', () => {
  test('a Windows-zoned master, an exception and a cancelled occurrence', () => {
    const master: GraphEvent = {
      id: 'm1',
      type: 'seriesMaster',
      subject: 'Stand-up',
      body: { contentType: 'text', content: 'Daily sync' },
      start: { dateTime: '2027-03-01T09:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2027-03-01T09:15:00.0000000', timeZone: 'UTC' },
      originalStartTimeZone: 'GMT Standard Time',
      iCalUId: 'ical-1',
      singleValueExtendedProperties: [
        { id: 'String {4f1a8c52-7d36-4e0b-9a1f-6c2b3d8e5a71} Name homaUid', value: 'homa-uid' },
      ],
      recurrence: { pattern: { type: 'weekly', interval: 1, daysOfWeek: ['monday'], firstDayOfWeek: 'monday' }, range },
      cancelledOccurrences: ['OID.m1.2027-04-05'],
      exceptionOccurrences: [
        {
          id: 'x1',
          originalStart: '2027-03-08T09:00:00Z',
          subject: 'Stand-up (late)',
          start: { dateTime: '2027-03-08T11:00:00.0000000', timeZone: 'UTC' },
          end: { dateTime: '2027-03-08T11:15:00.0000000', timeZone: 'UTC' },
        },
      ],
    };
    expect(uidOf(master)).toBe('homa-uid');
    const [e] = readSeries(master, 'UTC').events;
    expect(e).toMatchObject({
      uid: 'homa-uid',
      tz: 'Europe/London',
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      description: 'Daily sync',
    });
    // 5 April is after the clocks change: still 09:00 in London.
    expect(e?.exdates).toEqual([new Date('2027-04-05T08:00:00Z')]);
    expect(e?.overrides).toMatchObject([
      {
        recurrenceId: new Date('2027-03-08T09:00:00Z'),
        summary: 'Stand-up (late)',
        startAt: new Date('2027-03-08T11:00:00Z'),
      },
    ]);
  });

  test('an all-day event and an unknown zone', () => {
    const [day] = readSeries(
      {
        id: 'd',
        subject: 'Trip',
        isAllDay: true,
        start: { dateTime: '2027-04-01T00:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2027-04-04T00:00:00.0000000', timeZone: 'UTC' },
      },
      'Asia/Tehran',
    ).events;
    expect(day).toMatchObject({ allDay: true, uid: 'd@outlook', start: new Date('2027-04-01T00:00:00Z') });
    expect(instantOf({ dateTime: '2027-04-01T09:00:00', timeZone: 'Mars Standard Time' })).toBeNull();
  });

  test('HTML bodies become text', () => {
    expect(
      bodyText({
        contentType: 'html',
        content: '<html><body><p>Bring&nbsp;snacks &amp; tea</p><br>Thanks</body></html>',
      }),
    ).toBe('Bring snacks & tea\n\nThanks');
  });
});
