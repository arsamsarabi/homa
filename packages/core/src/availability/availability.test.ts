import { describe, expect, test } from 'bun:test';
import { freeSlots, mergeBusy } from './availability';

const d = (s: string): Date => new Date(s);
const interval = (start: string, end: string): { start: Date; end: Date } => ({
  start: d(start),
  end: d(end),
});

describe('mergeBusy', () => {
  const from = d('2026-12-01T00:00:00Z');
  const to = d('2026-12-02T00:00:00Z');

  test('clips intervals to [from, to) and sorts', () => {
    expect(
      mergeBusy(
        [
          interval('2026-11-30T22:00:00Z', '2026-12-01T02:00:00Z'),
          interval('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z'),
        ],
        from,
        to,
      ),
    ).toEqual([
      interval('2026-12-01T00:00:00Z', '2026-12-01T02:00:00Z'),
      interval('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z'),
    ]);
  });

  test('merges overlapping and touching intervals', () => {
    expect(
      mergeBusy(
        [
          interval('2026-12-01T09:00:00Z', '2026-12-01T10:00:00Z'),
          interval('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z'),
          interval('2026-12-01T10:30:00Z', '2026-12-01T12:00:00Z'),
        ],
        from,
        to,
      ),
    ).toEqual([interval('2026-12-01T09:00:00Z', '2026-12-01T12:00:00Z')]);
  });

  test('drops intervals wholly outside the range', () => {
    expect(mergeBusy([interval('2026-11-30T10:00:00Z', '2026-11-30T11:00:00Z')], from, to)).toEqual([]);
    expect(mergeBusy([interval('2026-12-02T00:00:00Z', '2026-12-02T01:00:00Z')], from, to)).toEqual([]);
  });

  test('empty input yields empty', () => {
    expect(mergeBusy([], from, to)).toEqual([]);
  });
});

describe('freeSlots', () => {
  const from = d('2026-12-01T09:00:00Z');
  const to = d('2026-12-01T17:00:00Z');

  test('whole range is free when busy is empty', () => {
    expect(freeSlots([], from, to, 30)).toEqual([interval('2026-12-01T09:00:00Z', '2026-12-01T17:00:00Z')]);
  });

  test('returns gaps between busy blocks that meet minMinutes', () => {
    const busy = [
      interval('2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z'),
      interval('2026-12-01T14:00:00Z', '2026-12-01T15:00:00Z'),
    ];
    expect(freeSlots(busy, from, to, 60)).toEqual([
      interval('2026-12-01T09:00:00Z', '2026-12-01T10:00:00Z'),
      interval('2026-12-01T11:00:00Z', '2026-12-01T14:00:00Z'),
      interval('2026-12-01T15:00:00Z', '2026-12-01T17:00:00Z'),
    ]);
    expect(freeSlots(busy, from, to, 180)).toEqual([interval('2026-12-01T11:00:00Z', '2026-12-01T14:00:00Z')]);
  });

  test('busy covering the whole range yields no free slots', () => {
    expect(freeSlots([interval('2026-12-01T08:00:00Z', '2026-12-01T18:00:00Z')], from, to, 1)).toEqual([]);
  });
});
