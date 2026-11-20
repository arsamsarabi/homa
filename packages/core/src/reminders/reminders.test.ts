import { describe, expect, test } from 'bun:test';
import { fireAt, nextStandaloneFire, normalizeReminders } from './reminders';

const d = (s: string): Date => new Date(s);

describe('fireAt', () => {
  const london = { allDay: false, tz: 'Europe/London', homeTz: null };

  test('minutes are exact', () => {
    expect(fireAt({ ...london, start: d('2026-03-16T09:00:00Z') }, 10)).toEqual(d('2026-03-16T08:50:00Z'));
  });

  test('whole days are wall-clock days across a clock change', () => {
    // Monday 30 March 2026 09:00 BST (08:00Z); the clocks went forward on Sunday the 29th.
    const start = d('2026-03-30T08:00:00Z');
    expect(fireAt({ ...london, start }, 1440)).toEqual(d('2026-03-29T08:00:00Z')); // 09:00 BST
    expect(fireAt({ ...london, start }, 2880)).toEqual(d('2026-03-28T09:00:00Z')); // 09:00 GMT
    expect(fireAt({ ...london, start }, 1440 + 30)).toEqual(d('2026-03-29T07:30:00Z'));
  });

  test('all-day events start at midnight in the home zone', () => {
    const start = d('2026-07-06T00:00:00Z');
    expect(fireAt({ start, allDay: true, tz: 'UTC', homeTz: 'Asia/Tehran' }, 0)).toEqual(d('2026-07-05T20:30:00Z'));
    expect(fireAt({ start, allDay: true, tz: 'UTC', homeTz: null }, 1440)).toEqual(d('2026-07-05T00:00:00Z'));
    // "The day before at 09:00" as Google encodes it: 15 hours before midnight.
    expect(fireAt({ start, allDay: true, tz: 'UTC', homeTz: 'Europe/London' }, 900)).toEqual(d('2026-07-05T08:00:00Z'));
  });
});

describe('nextStandaloneFire', () => {
  test('a one-off fires once', () => {
    const s = { startsAt: d('2026-07-06T17:00:00Z'), tz: 'UTC', rrule: null };
    expect(nextStandaloneFire(s, d('2026-07-06T16:00:00Z'))).toEqual(s.startsAt);
    expect(nextStandaloneFire(s, s.startsAt)).toBeNull();
  });

  test('a daily reminder keeps its wall time across a clock change', () => {
    const s = { startsAt: d('2026-03-27T09:00:00Z'), tz: 'Europe/London', rrule: 'FREQ=DAILY' }; // 09:00 GMT
    expect(nextStandaloneFire(s, d('2026-03-27T09:00:00Z'))).toEqual(d('2026-03-28T09:00:00Z'));
    expect(nextStandaloneFire(s, d('2026-03-28T09:00:00Z'))).toEqual(d('2026-03-29T08:00:00Z')); // 09:00 BST
  });

  test('a rule that has ended fires no more', () => {
    const s = { startsAt: d('2026-01-01T09:00:00Z'), tz: 'UTC', rrule: 'FREQ=WEEKLY;COUNT=2' };
    expect(nextStandaloneFire(s, d('2026-01-01T09:00:00Z'))).toEqual(d('2026-01-08T09:00:00Z'));
    expect(nextStandaloneFire(s, d('2026-01-08T09:00:00Z'))).toBeNull();
  });

  test('a yearly reminder finds next year', () => {
    const s = { startsAt: d('2025-03-20T12:00:00Z'), tz: 'Asia/Tehran', rrule: 'FREQ=YEARLY' };
    expect(nextStandaloneFire(s, d('2026-04-01T00:00:00Z'))).toEqual(d('2027-03-20T12:00:00Z'));
  });
});

test('normalizeReminders sorts and drops duplicates', () => {
  expect(normalizeReminders([30, 10, 30, 0])).toEqual([0, 10, 30]);
});
