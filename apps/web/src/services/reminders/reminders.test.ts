import { describe, expect, test } from 'bun:test';
import { keyBytes, offsetLabel, reminderChoices, snoozeUntil, toggleReminder } from './reminders';

describe('reminder offsets', () => {
  test('are named by their largest whole unit', () => {
    expect(offsetLabel(0)).toEqual({ key: 'atStart' });
    expect(offsetLabel(45)).toEqual({ key: 'minutes', count: 45 });
    expect(offsetLabel(120)).toEqual({ key: 'hours', count: 2 });
    expect(offsetLabel(2880)).toEqual({ key: 'days', count: 2 });
    expect(offsetLabel(10080)).toEqual({ key: 'weeks', count: 1 });
    expect(offsetLabel(90)).toEqual({ key: 'minutes', count: 90 });
  });

  test('choices add offsets the event has beside the presets', () => {
    expect(reminderChoices([45])).toContain(45);
    expect(reminderChoices([10])).toEqual(reminderChoices([]));
  });

  test('toggling keeps them sorted and at most five', () => {
    expect(toggleReminder([60], 10)).toEqual([10, 60]);
    expect(toggleReminder([10, 60], 10)).toEqual([60]);
    expect(toggleReminder([1, 2, 3, 4, 5], 6)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('snoozeUntil', () => {
  const now = new Date('2026-03-28T22:30:00Z');
  test('minutes from now', () => {
    expect(snoozeUntil('30', now, 'UTC')).toEqual(new Date('2026-03-28T23:00:00Z'));
  });
  test('tomorrow is 09:00 in the zone, across a clock change', () => {
    // 28 March 22:30 GMT; the clocks go forward that night, so 09:00 on the 29th is 08:00Z.
    expect(snoozeUntil('tomorrow', now, 'Europe/London')).toEqual(new Date('2026-03-29T08:00:00Z'));
    // Already the 29th in Tehran (02:00): tomorrow is the 30th.
    expect(snoozeUntil('tomorrow', now, 'Asia/Tehran')).toEqual(new Date('2026-03-30T05:30:00Z'));
  });
});

test('keyBytes decodes base64url', () => {
  expect([...keyBytes('AQID_w')]).toEqual([1, 2, 3, 255]);
});
