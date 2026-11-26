import { expect, test } from 'bun:test';
import { OccurrenceListSchema } from './calendar';
import { CalendarSearchSchema } from './search';

test('valid search params pass, bad ones fall back to undefined', () => {
  expect(CalendarSearchSchema.parse({ view: 'month', date: '2026-11-19' })).toEqual({
    view: 'month',
    date: '2026-11-19',
  });
  expect(CalendarSearchSchema.parse({ view: 'decade', date: 'tomorrow' })).toEqual({
    view: undefined,
    date: undefined,
  });
});

test('tz is stripped from search params', () => {
  expect(CalendarSearchSchema.parse({ view: 'week', tz: 'Asia/Tehran' })).toEqual({ view: 'week' });
});

test('an occurrence missing a field fails to parse', () => {
  expect(() => OccurrenceListSchema.parse([{ eventId: 'e1' }])).toThrow();
});
