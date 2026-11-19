import { expect, test } from 'bun:test';
import type { Occurrence } from '@/schemas';
import { moveToDay } from './month-drag';

test('an event dropped three days later keeps its time of day', () => {
  const o = {
    start: new Date(2026, 2, 27, 9).toISOString(),
    end: new Date(2026, 2, 27, 10).toISOString(),
  } as Occurrence;
  const moved = moveToDay(o, '2026-03-27', '2026-03-30');
  expect([moved.start.getDate(), moved.start.getHours(), moved.end.getHours()]).toEqual([30, 9, 10]);
});
