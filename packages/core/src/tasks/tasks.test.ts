import { describe, expect, test } from 'bun:test';
import { nextDue } from './tasks';

describe('nextDue', () => {
  test('a daily task done on time moves to the next day', () => {
    expect(nextDue({ date: '2026-11-21', time: null, tz: 'UTC', rrule: 'FREQ=DAILY' }, '2026-11-21')).toEqual({
      date: '2026-11-22',
      time: null,
    });
  });

  test('an overdue daily task lands on today, not on a past day', () => {
    expect(nextDue({ date: '2026-11-18', time: null, tz: 'UTC', rrule: 'FREQ=DAILY' }, '2026-11-21')).toEqual({
      date: '2026-11-21',
      time: null,
    });
  });

  test('a weekly task done early moves a week on', () => {
    // Friday 27 November, done on Monday 23rd.
    expect(nextDue({ date: '2026-11-27', time: null, tz: 'UTC', rrule: 'FREQ=WEEKLY' }, '2026-11-23')).toEqual({
      date: '2026-12-04',
      time: null,
    });
  });

  test('a timed task keeps its wall-clock time across a clock change', () => {
    // 09:00 London on Saturday 28 March 2026 (GMT); the next day is BST.
    expect(
      nextDue({ date: '2026-03-28', time: '09:00', tz: 'Europe/London', rrule: 'FREQ=DAILY' }, '2026-03-28'),
    ).toEqual({ date: '2026-03-29', time: '09:00' });
  });

  test('a timed task in a half-hour zone keeps its time', () => {
    expect(
      nextDue({ date: '2026-03-20', time: '23:30', tz: 'Asia/Tehran', rrule: 'FREQ=WEEKLY' }, '2026-03-20'),
    ).toEqual({ date: '2026-03-27', time: '23:30' });
  });

  test('a monthly task on the 31st skips short months', () => {
    expect(nextDue({ date: '2026-01-31', time: null, tz: 'UTC', rrule: 'FREQ=MONTHLY' }, '2026-01-31')).toEqual({
      date: '2026-03-31',
      time: null,
    });
  });

  test('a rule that has ended gives null', () => {
    expect(
      nextDue({ date: '2026-11-21', time: null, tz: 'UTC', rrule: 'FREQ=DAILY;COUNT=1' }, '2026-11-21'),
    ).toBeNull();
  });
});
