import { expect, test } from 'bun:test';
import { monthGrid } from './Calendar';

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
