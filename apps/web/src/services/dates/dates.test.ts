import { describe, expect, test } from 'bun:test';
import {
  daysBetween,
  isoDate,
  isoLocal,
  monthGrid,
  parseIsoDate,
  parseIsoLocal,
  rangeFor,
  step,
  touchesDay,
  wallSpan,
} from './dates';

const day = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m, d));

test('month grid covers whole weeks starting on the chosen day', () => {
  // November 2026 starts on a Sunday and has 30 days.
  const monday = monthGrid(day(2026, 10, 18), 1);
  expect(isoDate(monday[0] ?? new Date())).toBe('2026-10-26');
  expect(monday.length % 7).toBe(0);
  expect(isoDate(monday.at(-1) ?? new Date())).toBe('2026-12-06');

  const saturday = monthGrid(day(2026, 10, 18), 6);
  expect(saturday[0]?.getUTCDay()).toBe(6);
  expect(saturday.some((d) => isoDate(d) === '2026-11-01')).toBe(true);
});

describe('ranges', () => {
  const thu = day(2026, 10, 19);
  test('week starts on the week start and spans 7 days', () => {
    const r = rangeFor('week', thu, 1);
    expect(isoDate(r.from)).toBe('2026-11-16');
    expect(r.days).toHaveLength(7);
  });
  test('year and agenda', () => {
    expect(isoDate(rangeFor('year', thu, 1).to)).toBe('2027-01-01');
    expect(rangeFor('agenda', thu, 1).days).toHaveLength(30);
  });
  test('step moves by the view', () => {
    expect(isoDate(step('month', thu, 1))).toBe('2026-12-01');
    expect(isoDate(step('week', thu, -1))).toBe('2026-11-12');
  });
});

test('timed spans are shown in the viewed zone; all-day ones keep their dates', () => {
  const timed = wallSpan({ start: '2026-11-19T22:30:00Z', end: '2026-11-19T23:30:00Z', allDay: false }, 'Asia/Tehran');
  expect(isoLocal(timed.start)).toBe('2026-11-20T02:00');

  const s = wallSpan({ start: '2026-11-19T00:00:00Z', end: '2026-11-21T00:00:00Z', allDay: true }, 'Asia/Tehran');
  expect(touchesDay(s, day(2026, 10, 20))).toBe(true);
  expect(touchesDay(s, day(2026, 10, 21))).toBe(false);
});

test('ISO dates and times round-trip; junk falls back', () => {
  const fallback = day(2000, 0, 1);
  expect(isoDate(parseIsoDate('2026-03-05', fallback))).toBe('2026-03-05');
  expect(parseIsoDate('nope', fallback)).toBe(fallback);
  expect(isoLocal(parseIsoLocal('2026-03-29T01:30') ?? fallback)).toBe('2026-03-29T01:30');
  expect(parseIsoLocal('')).toBeUndefined();
});

test('days between counts calendar days, not 24-hour blocks', () => {
  expect(daysBetween(new Date(Date.UTC(2026, 2, 28, 23)), new Date(Date.UTC(2026, 2, 30, 1)))).toBe(2);
});
