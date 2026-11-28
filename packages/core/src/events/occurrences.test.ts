import { describe, expect, test } from 'bun:test';
import {
  cacheWindow,
  DENSE_CACHE_SIZE,
  HORIZON_DAYS,
  horizonFrom,
  occurrencesWithOverrides,
  resolveOccurrences,
} from './occurrences';

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

describe('cacheWindow', () => {
  const now = d('2026-11-28T12:00:00Z');

  test('a sparse rule is cached from its start to the horizon', () => {
    expect(cacheWindow(daily, now)).toEqual({ from: null, until: horizonFrom(now) });
  });

  test('a minutely rule is cached for DENSE_CACHE_SIZE occurrences from a day ago', () => {
    const minutely = {
      ...daily,
      startAt: d('2026-01-01T00:00:00Z'),
      endAt: d('2026-01-01T00:01:00Z'),
      rrule: 'FREQ=MINUTELY',
    };
    const w = cacheWindow(minutely, now);
    expect(w.from).toEqual(d('2026-11-27T12:00:00Z'));
    // Counted from the occurrence that overlaps `from` (it starts there).
    expect(w.until).toEqual(new Date(d('2026-11-27T12:00:00Z').getTime() + DENSE_CACHE_SIZE * 60_000));
  });

  test('an hourly rule caches up to the horizon when that fits', () => {
    const hourly = {
      ...daily,
      startAt: d('2020-01-01T00:00:00Z'),
      endAt: d('2020-01-01T00:30:00Z'),
      rrule: 'FREQ=HOURLY;INTERVAL=4',
    };
    expect(cacheWindow(hourly, now)).toEqual({ from: d('2026-11-27T12:00:00Z'), until: horizonFrom(now) });
  });
});

test('resolveOccurrences expands what falls before a windowed cache', () => {
  const hourly = {
    ...daily,
    startAt: d('2026-01-01T00:00:00Z'),
    endAt: d('2026-01-01T00:30:00Z'),
    rrule: 'FREQ=HOURLY',
    expandedFrom: d('2026-11-27T12:00:00Z'),
    expandedUntil: d('2026-12-01T00:00:00Z'),
  };
  const out = resolveOccurrences({
    cached: [],
    late: [hourly],
    events: [hourly],
    overrides: [],
    from: d('2026-11-20T10:00:00Z'),
    to: d('2026-11-20T12:00:00Z'),
  });
  expect(out.map((o) => o.start.toISOString())).toEqual(['2026-11-20T10:00:00.000Z', '2026-11-20T11:00:00.000Z']);
});
