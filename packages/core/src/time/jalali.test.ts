import { describe, expect, test } from 'bun:test';
import { fromJalali, jalaliDate } from './jalali';

describe('fromJalali', () => {
  test('is the inverse of jalaliDate for every day from 2024 to 2031', () => {
    for (let t = Date.UTC(2024, 0, 1); t < Date.UTC(2032, 0, 1); t += 86_400_000) {
      const { year, month, day } = jalaliDate(new Date(t));
      expect(fromJalali(year, month, day)?.getTime()).toBe(t);
    }
  });

  test('has no date for days a month lacks', () => {
    expect(fromJalali(1405, 7, 31)).toBeUndefined(); // Mehr has 30 days
    expect(fromJalali(1405, 13, 1)).toBeUndefined();
    expect(fromJalali(1405, 1, 0)).toBeUndefined();
  });

  test('knows Nowruz', () => {
    expect(fromJalali(1406, 1, 1)?.toISOString()).toBe('2027-03-21T00:00:00.000Z');
  });
});
