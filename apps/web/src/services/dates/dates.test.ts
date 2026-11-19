import { describe, expect, test } from 'bun:test';
import { addDays, daysBetween, isoDate, localSpan, monthGrid, parseIsoDate, rangeFor, step, touchesDay } from './dates';

test('month grid covers whole weeks starting on the chosen day', () => {
  // November 2026 starts on a Sunday and has 30 days.
  const monday = monthGrid(new Date(2026, 10, 18), 1);
  expect(monday[0]?.toDateString()).toBe(new Date(2026, 9, 26).toDateString()); // Mon 26 Oct
  expect(monday.length % 7).toBe(0);
  expect(monday.at(-1)?.toDateString()).toBe(new Date(2026, 11, 6).toDateString()); // Sun 6 Dec

  const saturday = monthGrid(new Date(2026, 10, 18), 6);
  expect(saturday[0]?.getDay()).toBe(6);
  expect(saturday.some((d) => d.getMonth() === 10 && d.getDate() === 1)).toBe(true);
});

describe('ranges', () => {
  const thu = new Date(2026, 10, 19);
  test('week starts on the week start and spans 7 days', () => {
    const r = rangeFor('week', thu, 1);
    expect(r.from.toDateString()).toBe(new Date(2026, 10, 16).toDateString());
    expect(r.days).toHaveLength(7);
  });
  test('year and agenda', () => {
    expect(rangeFor('year', thu, 1).to.getFullYear()).toBe(2027);
    expect(rangeFor('agenda', thu, 1).days).toHaveLength(30);
  });
  test('step moves by the view', () => {
    expect(step('month', thu, 1).getMonth()).toBe(11);
    expect(step('week', thu, -1).getDate()).toBe(12);
  });
});

test('addDays keeps the time of day across the clock change', () => {
  const d = addDays(new Date(2026, 2, 28, 9, 30), 2);
  expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([30, 9, 30]);
});

test('all-day spans keep their calendar dates', () => {
  const s = localSpan({ start: '2026-11-19T00:00:00Z', end: '2026-11-21T00:00:00Z', allDay: true });
  expect(s.start.getDate()).toBe(19);
  expect(touchesDay(s, new Date(2026, 10, 20))).toBe(true);
  expect(touchesDay(s, new Date(2026, 10, 21))).toBe(false);
});

test('ISO dates round-trip, and junk falls back to today', () => {
  expect(isoDate(parseIsoDate('2026-03-05'))).toBe('2026-03-05');
  expect(isoDate(parseIsoDate('nope'))).toBe(isoDate(new Date()));
});

test('days between counts calendar days, not 24-hour blocks', () => {
  expect(daysBetween(new Date(2026, 2, 28, 23), new Date(2026, 2, 30, 1))).toBe(2);
});
