import { expect, test } from 'bun:test';
import type { Occurrence } from '@/schemas';
import { allowedScopes, seriesPatch, shiftsSeries } from './series-change';

const o = { start: '2026-11-19T09:00:00.000Z', end: '2026-11-19T10:00:00.000Z', recurring: true } as Occurrence;

test('series-wide changes leave out "this event"', () => {
  expect(allowedScopes(true)).toEqual(['following', 'all']);
  expect(allowedScopes(false)).toEqual(['this', 'following', 'all']);
});

test('only time changes to the whole of a recurring event are re-based', () => {
  expect(shiftsSeries(o, 'all', { start: o.start })).toBe(true);
  expect(shiftsSeries(o, 'all', { summary: 'x' })).toBe(false);
  expect(shiftsSeries(o, 'this', { start: o.start })).toBe(false);
});

test('moving an occurrence two hours later moves the series start two hours later', () => {
  const patch = seriesPatch(
    o,
    { start: '2026-11-19T11:00:00.000Z', end: '2026-11-19T12:30:00.000Z' },
    '2026-11-02T09:00:00.000Z',
  );
  expect(patch).toEqual({ start: '2026-11-02T11:00:00.000Z', end: '2026-11-02T12:30:00.000Z' });
});
