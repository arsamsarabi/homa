import { expect, test } from 'bun:test';
import { rangeFor } from '@/services/dates';
import { jalaliViewTitle, viewTitle } from './view-title';

const f = (o: Intl.DateTimeFormatOptions, l = 'en-GB'): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(l, { ...o, timeZone: 'UTC' });
const formats = {
  fullDate: f({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  monthYear: f({ month: 'long', year: 'numeric' }),
  year: f({ year: 'numeric' }),
  shortDayMonth: f({ day: 'numeric', month: 'short' }),
  jalaliFullDate: f({ day: 'numeric', month: 'long', year: 'numeric' }, 'en-GB-u-ca-persian'),
  jalaliMonthYear: f({ month: 'long', year: 'numeric' }, 'en-GB-u-ca-persian'),
};
const thu = new Date(Date.UTC(2026, 10, 19));

test('each view has its own title', () => {
  expect(viewTitle('day', thu, rangeFor('day', thu, 1), formats)).toMatch(/^Thursday,? 19 November 2026$/);
  expect(viewTitle('month', thu, rangeFor('month', thu, 1), formats)).toBe('November 2026');
  expect(viewTitle('year', thu, rangeFor('year', thu, 1), formats)).toBe('2026');
  expect(viewTitle('agenda', thu, rangeFor('agenda', thu, 1), formats)).toMatch(/19 Nov.*18 Dec/);
});

test('the Jalali title covers the dates shown', () => {
  expect(jalaliViewTitle('day', thu, rangeFor('day', thu, 1), formats)).toMatch(/^28 Aban 1405/);
  // November 2026 runs from 10 Aban to 9 Azar.
  expect(jalaliViewTitle('month', thu, rangeFor('month', thu, 1), formats)).toMatch(/^Aban.*Azar 1405/);
});
