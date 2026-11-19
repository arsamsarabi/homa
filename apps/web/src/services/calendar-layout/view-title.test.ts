import { expect, test } from 'bun:test';
import { rangeFor } from '@/services/dates';
import { viewTitle } from './view-title';

const f = (o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => new Intl.DateTimeFormat('en-GB', o);
const formats = {
  fullDate: f({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  monthYear: f({ month: 'long', year: 'numeric' }),
  year: f({ year: 'numeric' }),
  shortDayMonth: f({ day: 'numeric', month: 'short' }),
};
const thu = new Date(2026, 10, 19);

test('each view has its own title', () => {
  expect(viewTitle('day', thu, rangeFor('day', thu, 1), formats)).toMatch(/^Thursday,? 19 November 2026$/);
  expect(viewTitle('month', thu, rangeFor('month', thu, 1), formats)).toBe('November 2026');
  expect(viewTitle('year', thu, rangeFor('year', thu, 1), formats)).toBe('2026');
  expect(viewTitle('agenda', thu, rangeFor('agenda', thu, 1), formats)).toMatch(/19 Nov.*18 Dec/);
});
