import { expect, test } from 'bun:test';
import { OccurrenceListSchema } from './calendar';
import { CalendarSearchSchema } from './search';

test('valid search params pass, bad ones fall back to undefined', () => {
  expect(CalendarSearchSchema.parse({ view: 'month', date: '2026-11-19', tz: 'Asia/Tehran' })).toEqual({
    view: 'month',
    date: '2026-11-19',
    tz: 'Asia/Tehran',
  });
  expect(CalendarSearchSchema.parse({ view: 'decade', date: 'tomorrow', tz: 'Mars/Olympus' })).toEqual({
    view: undefined,
    date: undefined,
    tz: undefined,
  });
});

test('an occurrence missing a field fails to parse', () => {
  expect(() => OccurrenceListSchema.parse([{ eventId: 'e1' }])).toThrow();
});
