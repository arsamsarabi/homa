import { expect, test } from 'bun:test';
import { basicUtc, googleBody, googleEventId, instanceBody, instanceId, readSeries, seriesIcs } from './mapping';

const weekly = {
  id: 'abc123',
  etag: '"1"',
  iCalUID: 'standup@google.com',
  summary: 'Stand-up; daily, short',
  description: 'Line one\nBEGIN:VEVENT',
  start: { dateTime: '2027-03-01T09:00:00Z', timeZone: 'Europe/London' },
  end: { dateTime: '2027-03-01T09:15:00Z', timeZone: 'Europe/London' },
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE;TZID=Europe/London:20270308T090000', 'EXRULE:FREQ=DAILY'],
};

test('a series with a moved and a cancelled occurrence reads as one event with an override and EXDATEs', () => {
  const moved = {
    id: 'abc123_20270315T090000Z',
    recurringEventId: 'abc123',
    iCalUID: 'standup@google.com',
    summary: 'Stand-up (moved)',
    originalStartTime: { dateTime: '2027-03-15T09:00:00Z', timeZone: 'Europe/London' },
    start: { dateTime: '2027-03-15T10:00:00Z', timeZone: 'Europe/London' },
    end: { dateTime: '2027-03-15T10:15:00Z', timeZone: 'Europe/London' },
  };
  const cancelled = {
    id: 'abc123_20270322T090000Z',
    status: 'cancelled',
    recurringEventId: 'abc123',
    originalStartTime: { dateTime: '2027-03-22T09:00:00Z', timeZone: 'Europe/London' },
  };
  const { events, skipped } = readSeries({ master: weekly, exceptions: [moved, cancelled] }, 'UTC', 'UTC');
  expect(skipped).toBe(0);
  const [e] = events;
  expect(e?.uid).toBe('standup@google.com');
  expect(e?.summary).toBe('Stand-up; daily, short');
  // The newline is escaped, so the description can't start a component.
  expect(e?.description).toBe('Line one\nBEGIN:VEVENT');
  expect(e?.tz).toBe('Europe/London');
  expect(e?.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
  expect(e?.exdates.map((d) => d.toISOString())).toEqual(['2027-03-08T09:00:00.000Z', '2027-03-22T09:00:00.000Z']);
  expect(e?.overrides).toEqual([
    {
      recurrenceId: new Date('2027-03-15T09:00:00Z'),
      summary: 'Stand-up (moved)',
      description: null,
      location: null,
      startAt: new Date('2027-03-15T10:00:00Z'),
      endAt: new Date('2027-03-15T10:15:00Z'),
    },
  ]);
  // EXRULE isn't something Homa expands, so it's dropped rather than misread.
  expect(seriesIcs({ master: weekly, exceptions: [] }, 'UTC')).not.toContain('EXRULE');
});

test('all-day events use dates; timed ones without a zone take the calendar zone', () => {
  const [day] = readSeries(
    {
      master: { id: 'd1', summary: 'Holiday', start: { date: '2027-04-02' }, end: { date: '2027-04-03' } },
      exceptions: [],
    },
    'Asia/Tehran',
    'UTC',
  ).events;
  expect(day).toMatchObject({
    allDay: true,
    start: new Date('2027-04-02T00:00:00Z'),
    end: new Date('2027-04-03T00:00:00Z'),
  });
  expect(day?.uid).toBe('d1@google.com');
  const [timed] = readSeries(
    {
      master: {
        id: 't1',
        summary: 'Call',
        start: { dateTime: '2027-04-02T10:00:00+03:30' },
        end: { dateTime: '2027-04-02T11:00:00+03:30' },
      },
      exceptions: [],
    },
    'Asia/Tehran',
    'UTC',
  ).events;
  expect(timed).toMatchObject({ allDay: false, tz: 'Asia/Tehran', start: new Date('2027-04-02T06:30:00Z') });
});

test('an event without a start is skipped with a warning', () => {
  const r = readSeries({ master: { id: 'x', summary: 'Broken' }, exceptions: [] }, 'UTC', 'UTC');
  expect(r.events).toEqual([]);
  expect(r.skipped).toBe(1);
});

test('push bodies: a series with its zone, EXDATEs and an override instance', () => {
  const event = {
    uid: 'u1',
    summary: 'Gym',
    description: null,
    location: 'Hall',
    start: new Date('2027-03-01T18:00:00Z'),
    end: new Date('2027-03-01T19:00:00Z'),
    allDay: false,
    tz: 'Europe/London',
    rrule: 'FREQ=WEEKLY',
    exdates: [new Date('2027-03-08T18:00:00Z')],
    rdates: [],
    overrides: [],
  };
  expect(googleBody(event)).toEqual({
    summary: 'Gym',
    description: '',
    location: 'Hall',
    start: { dateTime: '2027-03-01T18:00:00.000Z', timeZone: 'Europe/London' },
    end: { dateTime: '2027-03-01T19:00:00.000Z', timeZone: 'Europe/London' },
    recurrence: ['RRULE:FREQ=WEEKLY', 'EXDATE:20270308T180000Z'],
  });
  const o = {
    recurrenceId: new Date('2027-03-15T18:00:00Z'),
    summary: null,
    description: null,
    location: 'Pool',
    startAt: new Date('2027-03-15T19:00:00Z'),
    endAt: new Date('2027-03-15T20:00:00Z'),
  };
  expect(instanceBody(event, o)).toMatchObject({ summary: 'Gym', location: 'Pool' });
  expect(instanceId('s1', o.recurrenceId, false)).toBe('s1_20270315T180000Z');
  expect(instanceId('s1', new Date('2027-03-15T00:00:00Z'), true)).toBe('s1_20270315');
  expect(googleBody({ ...event, allDay: true, rrule: null, exdates: [] }).start).toEqual({ date: '2027-03-01' });
  expect(basicUtc(new Date('2027-01-02T03:04:05.678Z'))).toBe('20270102T030405Z');
});

test('event ids are valid base32hex and stable per UID', () => {
  expect(googleEventId('a@b')).toMatch(/^[0-9a-v]{5,1024}$/);
  expect(googleEventId('a@b')).toBe(googleEventId('a@b'));
  expect(googleEventId('a@b')).not.toBe(googleEventId('a@c'));
});
