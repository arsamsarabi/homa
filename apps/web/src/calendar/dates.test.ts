import { describe, expect, test } from 'bun:test';
import {
  addDays,
  layoutColumns,
  localSpan,
  monthGrid,
  rangeFor,
  repeatOf,
  rruleOf,
  snap,
  step,
  touchesDay,
} from './dates';

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

test('snap rounds to 15 minutes', () => {
  expect(snap(7)).toBe(0);
  expect(snap(8)).toBe(15);
  expect(snap(-22)).toBe(-15);
});

test('all-day spans keep their calendar dates', () => {
  const s = localSpan({ start: '2026-11-19T00:00:00Z', end: '2026-11-21T00:00:00Z', allDay: true });
  expect(s.start.getDate()).toBe(19);
  expect(touchesDay(s, new Date(2026, 10, 20))).toBe(true);
  expect(touchesDay(s, new Date(2026, 10, 21))).toBe(false);
});

test('overlapping events share the width', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 19, h, m);
  const placed = layoutColumns([
    { id: 'a', start: at(9), end: at(10) },
    { id: 'b', start: at(9, 30), end: at(11) },
    { id: 'c', start: at(10), end: at(10, 30) },
    { id: 'd', start: at(12), end: at(13) },
  ]);
  const by = Object.fromEntries(placed.map((p) => [p.id, [p.col, p.cols]]));
  expect(by).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
});

test('repeat choices round-trip to RRULEs', () => {
  expect(repeatOf('FREQ=WEEKLY')).toBe('weekly');
  expect(repeatOf('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('custom');
  expect(rruleOf('daily', null)).toBe('FREQ=DAILY');
  expect(rruleOf('custom', 'FREQ=WEEKLY;BYDAY=MO')).toBe('FREQ=WEEKLY;BYDAY=MO');
  expect(rruleOf('none', 'FREQ=DAILY')).toBeNull();
});
