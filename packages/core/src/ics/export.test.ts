import { describe, expect, test } from 'bun:test';
import { type SerializableEvent, serializeEvent } from './export';
import { parseIcs } from './import';

const d = (s: string): Date => new Date(s);
const opts = { floatingTz: 'UTC' };
const base: SerializableEvent = {
  uid: 'a@homa',
  summary: 'Stand-up',
  description: null,
  location: null,
  startAt: d('2026-03-16T09:00:00Z'),
  endAt: d('2026-03-16T09:15:00Z'),
  allDay: false,
  tz: 'Europe/London',
  rrule: null,
  exdates: [],
  rdates: [],
};

/** Serializes, parses back and returns the one event. */
const roundTrip = (...args: Parameters<typeof serializeEvent>): ReturnType<typeof parseIcs>['events'][number] => {
  const r = parseIcs(serializeEvent(...args), opts);
  expect(r).toMatchObject({ skipped: 0, warnings: [] });
  expect(r.events).toHaveLength(1);
  return r.events[0] as ReturnType<typeof parseIcs>['events'][number];
};

describe('serializeEvent', () => {
  test('writes wall-clock times with the IANA zone as TZID', () => {
    const text = serializeEvent({ ...base, startAt: d('2026-07-06T08:00:00Z'), endAt: d('2026-07-06T09:00:00Z') });
    expect(text).toContain('DTSTART;TZID=Europe/London:20260706T090000');
    expect(text).toContain('UID:a@homa');
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  test('a weekly series across the clock change, with exdates, rdates and overrides, round-trips', () => {
    const e: SerializableEvent = {
      ...base,
      description: 'Plan, blockers; demos\nand more',
      location: 'Room 4, floor 2',
      rrule: 'FREQ=WEEKLY;COUNT=6;BYDAY=MO',
      exdates: [d('2026-04-06T08:00:00Z')],
      rdates: [d('2026-04-01T08:00:00Z')],
    };
    const overrides = [
      {
        recurrenceId: d('2026-03-30T08:00:00Z'),
        summary: 'Stand-up (late)',
        description: null,
        location: null,
        startAt: d('2026-03-30T09:00:00Z'),
        endAt: d('2026-03-30T09:30:00Z'),
      },
    ];
    const back = roundTrip(e, overrides);
    expect(back).toEqual({
      uid: e.uid,
      summary: e.summary,
      description: e.description,
      location: e.location,
      start: e.startAt,
      end: e.endAt,
      allDay: false,
      tz: 'Europe/London',
      rrule: 'FREQ=WEEKLY;COUNT=6;BYDAY=MO',
      exdates: e.exdates as Date[],
      rdates: e.rdates as Date[],
      overrides,
    });
  });

  test('all-day events are dates, and UTC events are Z times', () => {
    const allDay = roundTrip({
      ...base,
      allDay: true,
      tz: 'UTC',
      startAt: d('2027-05-03T00:00:00Z'),
      endAt: d('2027-05-04T00:00:00Z'),
      rrule: 'FREQ=YEARLY',
      exdates: [d('2028-05-03T00:00:00Z')],
    });
    expect(allDay).toMatchObject({
      allDay: true,
      tz: 'UTC',
      start: d('2027-05-03T00:00:00Z'),
      end: d('2027-05-04T00:00:00Z'),
    });
    expect(allDay.exdates).toEqual([d('2028-05-03T00:00:00Z')]);
    expect(serializeEvent({ ...base, allDay: true, tz: 'UTC' })).toContain('DTSTART;VALUE=DATE:20260316');

    const utc = roundTrip({ ...base, tz: 'UTC', rrule: 'FREQ=DAILY;UNTIL=20260320T090000Z' });
    expect(utc).toMatchObject({ tz: 'UTC', start: base.startAt, rrule: 'FREQ=DAILY;UNTIL=20260320T090000Z' });
    expect(serializeEvent({ ...base, tz: 'UTC' })).toContain('DTSTART:20260316T090000Z');
  });

  test('other zones round-trip, including one with a half-hour offset', () => {
    for (const tz of ['Asia/Tehran', 'America/New_York', 'Australia/Adelaide'])
      expect(roundTrip({ ...base, tz })).toMatchObject({ tz, start: base.startAt, end: base.endAt });
  });
});
