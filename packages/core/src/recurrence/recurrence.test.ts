import { describe, expect, test } from 'bun:test';
import { continueFrom, endBefore, expand, isTimeZone, parseRrule, type Series } from './recurrence';

const iso = (o: { start: Date }[]) => o.map((x) => x.start.toISOString());
const d = (s: string) => new Date(s);

// Monday 16 March 2026 09:00 London (GMT); the clocks go forward on Sunday 29 March.
const standup: Series = {
  start: d('2026-03-16T09:00:00Z'),
  end: d('2026-03-16T09:15:00Z'),
  tz: 'Europe/London',
  rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=5',
  exdates: [],
};
const all = [d('2020-01-01T00:00:00Z'), d('2030-01-01T00:00:00Z')] as const;

describe('expand', () => {
  test('keeps local time across the clock change', () => {
    expect(iso(expand(standup, ...all))).toEqual([
      '2026-03-16T09:00:00.000Z',
      '2026-03-23T09:00:00.000Z',
      '2026-03-30T08:00:00.000Z',
      '2026-04-06T08:00:00.000Z',
      '2026-04-13T08:00:00.000Z',
    ]);
  });

  test('skips EXDATEs and keeps the duration', () => {
    const occ = expand({ ...standup, exdates: [d('2026-03-23T09:00:00Z')] }, ...all);
    expect(occ).toHaveLength(4);
    expect(occ[1]?.end.toISOString()).toBe('2026-03-30T08:15:00.000Z');
  });

  test('returns only occurrences overlapping the range', () => {
    expect(iso(expand(standup, d('2026-03-30T08:10:00Z'), d('2026-04-06T08:00:00Z')))).toEqual([
      '2026-03-30T08:00:00.000Z',
    ]);
  });

  test('honours a UTC UNTIL in the zone', () => {
    const s = { ...standup, rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20260330T080000Z' };
    expect(expand(s, ...all)).toHaveLength(3);
  });

  test('a single event is its own occurrence', () => {
    expect(expand({ ...standup, rrule: null }, ...all)).toEqual([
      { recurrenceId: standup.start, start: standup.start, end: standup.end },
    ]);
  });

  test('all-day events in UTC step by whole days', () => {
    const s: Series = {
      start: d('2026-03-28T00:00:00Z'),
      end: d('2026-03-29T00:00:00Z'),
      tz: 'UTC',
      rrule: 'FREQ=DAILY;COUNT=3',
      exdates: [],
    };
    expect(iso(expand(s, ...all))).toEqual([
      '2026-03-28T00:00:00.000Z',
      '2026-03-29T00:00:00.000Z',
      '2026-03-30T00:00:00.000Z',
    ]);
  });

  test('a local time skipped by the clock change moves forward', () => {
    // 01:30 doesn't exist in London on 29 March 2026; it becomes 02:30 BST (01:30 UTC).
    const s: Series = {
      start: d('2026-03-28T01:30:00Z'),
      end: d('2026-03-28T02:00:00Z'),
      tz: 'Europe/London',
      rrule: 'FREQ=DAILY;COUNT=2',
      exdates: [],
    };
    expect(iso(expand(s, ...all))[1]).toBe('2026-03-29T01:30:00.000Z');
  });

  test('stops at the limit for endless rules', () => {
    expect(expand({ ...standup, rrule: 'FREQ=DAILY' }, ...all, 50)).toHaveLength(50);
  });
});

describe('RDATE', () => {
  // Two weekly stand-ups before the clock change, plus extra dates after it (09:00 BST is 08:00 UTC).
  const series: Series = {
    ...standup,
    rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=2',
    rdates: [d('2026-04-01T08:00:00Z'), d('2026-03-23T09:00:00Z'), d('2026-04-08T08:00:00Z')],
  };

  test('adds dates to the rule, in order, once each, with the series duration', () => {
    const occ = expand(series, ...all);
    expect(iso(occ)).toEqual([
      '2026-03-16T09:00:00.000Z',
      '2026-03-23T09:00:00.000Z',
      '2026-04-01T08:00:00.000Z',
      '2026-04-08T08:00:00.000Z',
    ]);
    expect(occ[2]?.end.toISOString()).toBe('2026-04-01T08:15:00.000Z');
  });

  test('EXDATE cancels an RDATE, and the range still applies', () => {
    const occ = expand(
      { ...series, exdates: [d('2026-04-01T08:00:00Z')] },
      d('2026-03-20T00:00:00Z'),
      d('2026-04-30T00:00:00Z'),
    );
    expect(iso(occ)).toEqual(['2026-03-23T09:00:00.000Z', '2026-04-08T08:00:00.000Z']);
  });

  test('works without an RRULE', () => {
    expect(iso(expand({ ...standup, rrule: null, rdates: [d('2026-04-01T08:00:00Z')] }, ...all))).toEqual([
      '2026-03-16T09:00:00.000Z',
      '2026-04-01T08:00:00.000Z',
    ]);
  });
});

describe('splitting a series', () => {
  test('endBefore stops the series just before the occurrence', () => {
    const rrule = endBefore(standup.rrule ?? '', d('2026-03-30T08:00:00Z'));
    expect(rrule).not.toContain('COUNT');
    expect(expand({ ...standup, rrule }, ...all)).toHaveLength(2);
  });

  test('continueFrom reduces COUNT by the occurrences already past', () => {
    expect(continueFrom({ ...standup, rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=5' }, d('2026-03-30T08:00:00Z'))).toContain(
      'COUNT=3',
    );
  });
});

test('validation helpers', () => {
  expect(() => parseRrule('BYDAY=MO')).toThrow();
  expect(parseRrule('RRULE:FREQ=DAILY').freq).toBe('DAILY');
  expect(isTimeZone('Asia/Tehran')).toBe(true);
  expect(isTimeZone('Mars/Olympus')).toBe(false);
});
