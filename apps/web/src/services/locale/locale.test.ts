import { expect, test } from 'bun:test';
import { calendarLocale } from './locale';

test('Farsi weeks start on Saturday, English ones on Monday', () => {
  expect(calendarLocale('fa')).toEqual({ locale: 'fa-IR-u-ca-gregory', weekStart: 6 });
  expect(calendarLocale('en')).toEqual({ locale: 'en-GB', weekStart: 1 });
});
