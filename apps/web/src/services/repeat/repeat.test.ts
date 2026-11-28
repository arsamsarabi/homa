import { describe, expect, test } from 'bun:test';
import en from '@/lib/i18n/locales/en.json';
import { parseRepeat, repeatLabel, repeatRule, sameRepeat, weekOrder } from './repeat';

// A tiny i18next stand-in over en.json: plurals by count, {{name}} interpolation.
const t = (key: string, o: Record<string, unknown>): string => {
  const [section, name] = key.split('.') as [string, string];
  const table = (en as unknown as Record<string, Record<string, string>>)[section] ?? {};
  const raw = table[`${name}_${o.count === 1 ? 'one' : 'other'}`] ?? table[name] ?? key;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(o[k]));
};

describe('repeat rules', () => {
  test('reads the rules the picker can show', () => {
    expect(parseRepeat(null)).toBeNull();
    expect(parseRepeat('FREQ=DAILY')).toEqual({ every: 1, unit: 'days', days: [] });
    expect(parseRepeat('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO')).toEqual({ every: 2, unit: 'weeks', days: ['MO', 'WE'] });
    expect(parseRepeat('RRULE:freq=yearly;interval=3')).toEqual({ every: 3, unit: 'years', days: [] });
    expect(parseRepeat('FREQ=HOURLY;INTERVAL=2')).toEqual({ every: 2, unit: 'hours', days: [] });
    expect(parseRepeat('FREQ=MINUTELY;INTERVAL=15')).toEqual({ every: 15, unit: 'minutes', days: [] });
  });

  test('anything else is custom, kept as it is', () => {
    for (const r of [
      'FREQ=WEEKLY;COUNT=3',
      'FREQ=MONTHLY;BYDAY=2TU',
      'FREQ=HOURLY;BYDAY=MO',
      'FREQ=SECONDLY',
      'FREQ=DAILY;INTERVAL=0',
      'FREQ=DAILY;BYDAY=MO',
      'FREQ=WEEKLY;BYDAY=XX',
      'FREQ=DAILY;FREQ=WEEKLY',
      'nonsense',
    ])
      expect(parseRepeat(r)).toBe('custom');
  });

  test('builds RRULEs, leaving out what is implied', () => {
    expect(repeatRule({ every: 1, unit: 'days', days: [] })).toBe('FREQ=DAILY');
    expect(repeatRule({ every: 2, unit: 'weeks', days: ['WE', 'MO'] })).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE');
    expect(repeatRule({ every: 1, unit: 'weeks', days: ['TU'] }, 'TU')).toBe('FREQ=WEEKLY');
    expect(repeatRule({ every: 1, unit: 'months', days: ['MO'] })).toBe('FREQ=MONTHLY');
    expect(repeatRule({ every: 90, unit: 'minutes', days: [] })).toBe('FREQ=MINUTELY;INTERVAL=90');
    expect(sameRepeat('FREQ=WEEKLY;INTERVAL=1', 'FREQ=WEEKLY')).toBe(true);
    expect(sameRepeat('FREQ=WEEKLY;COUNT=2', 'FREQ=WEEKLY')).toBe(false);
  });

  test('reads as a sentence', () => {
    expect(repeatLabel(null, t, 'en-GB')).toBe('Does not repeat');
    expect(repeatLabel('FREQ=DAILY', t, 'en-GB')).toBe('Every day');
    expect(repeatLabel('FREQ=MONTHLY;INTERVAL=3', t, 'en-GB')).toBe('Every 3 months');
    expect(repeatLabel('FREQ=HOURLY', t, 'en-GB')).toBe('Every hour');
    expect(repeatLabel('FREQ=MINUTELY;INTERVAL=30', t, 'en-GB')).toBe('Every 30 minutes');
    expect(repeatLabel('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO', t, 'en-GB')).toBe('Every 2 weeks on Mon and Wed');
    expect(repeatLabel('FREQ=WEEKLY;BYDAY=SU,MO', t, 'en-GB', 0)).toBe('Every week on Sun and Mon');
    expect(repeatLabel('FREQ=WEEKLY;BYDAY=SU,MO', t, 'en-GB', 1)).toBe('Every week on Mon and Sun');
    expect(repeatLabel('FREQ=WEEKLY;COUNT=2', t, 'en-GB')).toBe('Custom rule');
  });

  test('orders the week from its first day', () => {
    expect(weekOrder(6)).toEqual(['SA', 'SU', 'MO', 'TU', 'WE', 'TH', 'FR']);
  });
});
