import { describe, expect, test } from 'bun:test';
import { HORIZON_DAYS, horizonFrom, occurrencesWithOverrides, resolveOccurrences } from './occurrences';

const d = (s: string): Date => new Date(s);
const daily = {
  id: 'e1',
  summary: 'Walk',
  description: null,
  location: null,
  startAt: d('2026-01-05T07:00:00Z'),
  endAt: d('2026-01-05T08:00:00Z'),
  tz: 'UTC',
  rrule: 'FREQ=DAILY;COUNT=5',
  exdates: [],
  expandedUntil: null,
};

test('the horizon is HORIZON_DAYS ahead', () => {
  expect(horizonFrom(d('2026-01-01T00:00:00Z')).getTime() - d('2026-01-01T00:00:00Z').getTime()).toBe(
    HORIZON_DAYS * 86_400_000,
  );
});

describe('occurrencesWithOverrides', () => {
  test('an override can move an occurrence into the range from outside it', () => {
    const moved = {
      recurrenceId: d('2026-01-09T07:00:00Z'),
      startAt: d('2026-01-05T12:00:00Z'),
      endAt: d('2026-01-05T13:00:00Z'),
    };
    const occ = occurrencesWithOverrides(daily, [moved], d('2026-01-05T00:00:00Z'), d('2026-01-06T00:00:00Z'));
    expect(occ.map((o) => [o.recurrenceId.toISOString(), o.start.toISOString()])).toEqual([
      ['2026-01-05T07:00:00.000Z', '2026-01-05T07:00:00.000Z'],
      ['2026-01-09T07:00:00.000Z', '2026-01-05T12:00:00.000Z'],
    ]);
  });
});

describe('resolveOccurrences', () => {
  test('merges cached and late occurrences, applies override details, and sorts by start', () => {
    const late = { ...daily, expandedUntil: d('2026-01-07T00:00:00Z') };
    const out = resolveOccurrences({
      cached: [
        {
          eventId: 'e1',
          recurrenceId: d('2026-01-06T07:00:00Z'),
          start: d('2026-01-06T07:00:00Z'),
          end: d('2026-01-06T08:00:00Z'),
        },
      ],
      late: [late],
      events: [late],
      overrides: [
        {
          eventId: 'e1',
          recurrenceId: d('2026-01-08T07:00:00Z'),
          startAt: d('2026-01-08T07:00:00Z'),
          endAt: d('2026-01-08T08:00:00Z'),
          summary: 'Long walk',
          description: null,
          location: 'Park',
        },
      ],
      from: d('2026-01-06T00:00:00Z'),
      to: d('2026-01-09T00:00:00Z'),
    });
    expect(out.map((o) => [o.start.toISOString(), o.summary, o.location, o.overridden])).toEqual([
      ['2026-01-06T07:00:00.000Z', 'Walk', null, false],
      ['2026-01-07T07:00:00.000Z', 'Walk', null, false],
      ['2026-01-08T07:00:00.000Z', 'Long walk', 'Park', true],
    ]);
  });
});
