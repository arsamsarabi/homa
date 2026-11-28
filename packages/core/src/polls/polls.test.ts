import { describe, expect, test } from 'bun:test';
import { type Ballot, cleanBallot, points, rankSlots, suggestSlots } from './polls';

const d = (s: string): Date => new Date(s);
const slots = [
  { id: 'fri', start: d('2026-12-04T19:00:00Z') },
  { id: 'sat', start: d('2026-12-05T18:00:00Z') },
  { id: 'tue', start: d('2026-12-08T19:00:00Z') },
];
const ballot = (participantId: string, ranked: string[], cannot: string[] = [], required = false): Ballot => ({
  participantId,
  required,
  ranked,
  cannot,
});

describe('points', () => {
  test('Borda: n for the first of n, then n − 1', () => {
    const p = points([ballot('a', ['fri', 'tue']), ballot('b', ['tue', 'fri', 'sat'])]);
    expect(Object.fromEntries(p)).toEqual({ fri: 2 + 2, tue: 1 + 3, sat: 1 });
  });
});

describe('rankSlots', () => {
  test('eligible slots by points, then how many can make it, then the earlier start', () => {
    const r = rankSlots(slots, [ballot('a', ['fri', 'tue']), ballot('b', ['tue', 'fri'])], null);
    expect(r.map((s) => [s.slotId, s.points, s.eligible])).toEqual([
      ['fri', 3, true],
      ['tue', 3, true],
      ['sat', 0, false],
    ]);
    expect(r[2]?.reason).toEqual({ needed: 2, have: 0 });
    expect(r[2]?.unranked).toEqual(['a', 'b']);
  });

  test('a required person who can’t makes a slot ineligible, however many points', () => {
    const r = rankSlots(
      slots,
      [ballot('a', ['sat', 'fri']), ballot('b', ['sat', 'fri']), ballot('sam', ['fri'], ['sat'], true)],
      2,
    );
    expect(r[0]?.slotId).toBe('fri');
    const sat = r.find((s) => s.slotId === 'sat');
    expect(sat?.eligible).toBe(false);
    expect(sat?.reason).toEqual({ requiredCannot: ['sam'] });
  });

  test('a quorum counts only people who ranked the slot', () => {
    const r = rankSlots(slots, [ballot('a', ['fri']), ballot('b', []), ballot('c', [])], 2);
    expect(r.every((s) => !s.eligible)).toBe(true);
    expect(r[0]?.slotId).toBe('fri');
  });
});

test('cleanBallot drops duplicates, unknown slots and ranked ones also marked can’t', () => {
  expect(cleanBallot(['fri', 'fri', 'x', 'sat'], ['sat', 'y'], new Set(['fri', 'sat', 'tue']))).toEqual({
    ranked: ['fri'],
    cannot: ['sat'],
  });
});

describe('suggestSlots', () => {
  const from = d('2026-12-07T00:00:00Z'); // Monday
  const to = d('2026-12-14T00:00:00Z');
  const busy = new Map([
    ['ada', [{ start: d('2026-12-07T18:00:00Z'), end: d('2026-12-07T21:00:00Z') }]],
    ['sam', [{ start: d('2026-12-08T18:00:00Z'), end: d('2026-12-08T20:00:00Z') }]],
  ]);

  test('evenings on weekdays where the required person is free, everyone free first, no overlaps', () => {
    const s = suggestSlots({
      from,
      to,
      durationMinutes: 90,
      busy,
      required: new Set(['ada']),
      tz: 'UTC',
      days: 'weekdays',
      between: { from: '18:00', to: '22:00' },
      max: 4,
    });
    expect(s).toHaveLength(4);
    for (const x of s) {
      expect(x.start.getUTCDay()).toBeGreaterThanOrEqual(1);
      expect(x.start.getUTCDay()).toBeLessThanOrEqual(5);
      expect(x.start.getUTCHours()).toBeGreaterThanOrEqual(18);
      expect(x.end.getTime()).toBeLessThanOrEqual(new Date(x.start).setUTCHours(22, 0, 0, 0));
      expect(x.busy).toEqual([]);
      // Ada is busy Monday evening; Monday 21:00–22:30 runs past 22:00.
      expect(x.start.getUTCDate()).not.toBe(7);
    }
    for (let i = 1; i < s.length; i++)
      expect((s[i] as { start: Date }).start >= (s[i - 1] as { end: Date }).end).toBe(true);
  });

  test('a required person who is busy everywhere leaves nothing', () => {
    const allBusy = new Map([['ada', [{ start: from, end: to }]]]);
    expect(
      suggestSlots({ from, to, durationMinutes: 60, busy: allBusy, required: new Set(['ada']), tz: 'UTC' }),
    ).toEqual([]);
  });

  test('local bounds follow the zone', () => {
    const s = suggestSlots({
      from,
      to: d('2026-12-08T00:00:00Z'),
      durationMinutes: 60,
      busy: new Map(),
      required: new Set(),
      tz: 'Asia/Tehran',
      between: { from: '09:00', to: '10:00' },
    });
    // 09:00 in Tehran (UTC+3:30) is 05:30 UTC.
    expect(s.map((x) => x.start.toISOString())).toEqual(['2026-12-07T05:30:00.000Z']);
  });
});
