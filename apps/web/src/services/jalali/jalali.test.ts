import { expect, test } from 'bun:test';
import { jalaliDate, occasionsOn } from './jalali';

const day = (s: string): Date => new Date(`${s}T00:00:00Z`);

test('Jalali dates', () => {
  expect(jalaliDate(day('2026-11-19'))).toEqual({ year: 1405, month: 8, day: 28 });
  expect(jalaliDate(day('2026-03-21'))).toEqual({ year: 1405, month: 1, day: 1 });
});

test('Persian occasions', () => {
  expect(occasionsOn(day('2026-03-21'))).toEqual(['nowruz']);
  expect(occasionsOn(day('2026-04-02'))).toEqual(['sizdahBedar']);
  expect(occasionsOn(day('2026-12-21'))).toEqual(['yalda']);
  expect(occasionsOn(day('2026-03-17'))).toEqual(['chaharshanbeSuri']);
  expect(occasionsOn(day('2027-03-16'))).toEqual(['chaharshanbeSuri']);
  // The Tuesday a week earlier isn't the last one.
  expect(occasionsOn(day('2026-03-10'))).toEqual([]);
  expect(occasionsOn(day('2026-11-19'))).toEqual([]);
});
