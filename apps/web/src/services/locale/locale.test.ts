import { expect, test } from 'bun:test';
import { calendarLocale } from './locale';

test('Farsi weeks start on Saturday, English ones on Monday', () => {
  expect(calendarLocale('fa')).toEqual({
    locale: 'fa-IR-u-ca-gregory',
    jalaliLocale: 'fa-IR-u-ca-persian',
    weekStart: 6,
  });
  expect(calendarLocale('en')).toEqual({ locale: 'en-GB', jalaliLocale: 'en-GB-u-ca-persian', weekStart: 1 });
});
