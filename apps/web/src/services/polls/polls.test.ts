import { expect, test } from 'bun:test';
import type { Poll } from '@/schemas';
import { cannot, move, rank, slotLabel, startBallot, unrank } from './polls';

const poll = (responded: boolean, ranked: string[] = [], no: string[] = []): Poll =>
  ({
    slots: ['a', 'b', 'c'].map((id) => ({ id, start: '2026-12-04T19:00:00Z', end: '2026-12-04T20:30:00Z' })),
    participants: [{ id: 'p', userId: 'u', name: 'Ada', required: false, responded, holds: false }],
    answers: [{ participantId: 'p', ranked, cannot: no }],
    me: { participantId: 'p', organizer: false },
  }) as unknown as Poll;

test('a slot reads as its day and times in the zone', () => {
  expect(slotLabel('2026-12-04T19:00:00Z', '2026-12-04T20:30:00Z', 'en-GB', 'Europe/London')).toBe(
    'Fri 4 Dec, 19:00 – 20:30',
  );
});

test('before answering, clashes start under can’t; after, the saved answer', () => {
  expect(startBallot(poll(false), ['b'])).toEqual({ ranked: [], unranked: ['a', 'c'], cannot: ['b'] });
  expect(startBallot(poll(true, ['c', 'a'], ['b']), ['a'])).toEqual({
    ranked: ['c', 'a'],
    unranked: [],
    cannot: ['b'],
  });
});

test('rows move between the groups and within the order', () => {
  let b = { ranked: [], unranked: ['a', 'b', 'c'], cannot: [] } as ReturnType<typeof startBallot>;
  b = rank(rank(b, 'b'), 'a');
  expect(b.ranked).toEqual(['b', 'a']);
  expect(move(b, 'a', -1).ranked).toEqual(['a', 'b']);
  expect(move(b, 'b', -1)).toBe(b);
  b = cannot(b, 'b');
  expect(b).toEqual({ ranked: ['a'], unranked: ['c'], cannot: ['b'] });
  expect(unrank(b, 'b').unranked).toEqual(['c', 'b']);
});
