import { expect, test } from 'bun:test';
import type { Occurrence } from '@/schemas';
import { moveToDay } from './month-drag';

test('an event dropped across the clock change keeps its time of day', () => {
  // 09:00 GMT on Friday 27 March 2026, dropped on Monday 30 March: 09:00 BST.
  const o = { start: '2026-03-27T09:00:00Z', end: '2026-03-27T10:00:00Z', allDay: false } as Occurrence;
  expect(moveToDay(o, '2026-03-27', '2026-03-30', 'Europe/London')).toEqual({
    start: new Date('2026-03-30T08:00:00Z'),
    end: new Date('2026-03-30T09:00:00Z'),
  });
});

test('all-day events move by whole dates', () => {
  const o = { start: '2026-03-27T00:00:00Z', end: '2026-03-28T00:00:00Z', allDay: true } as Occurrence;
  expect(moveToDay(o, '2026-03-27', '2026-03-30', 'Asia/Tehran').start).toEqual(new Date('2026-03-30T00:00:00Z'));
});
