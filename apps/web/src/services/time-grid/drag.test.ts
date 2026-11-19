import { describe, expect, test } from 'bun:test';
import type { Occurrence } from '@/schemas';
import { blockBox, type Drag, dragGhost, dragOutcome, dragTo, initialScrollHour, slotAt, snap } from './drag';

const days = [new Date(2026, 10, 16), new Date(2026, 10, 17), new Date(2026, 10, 18)];
const o = {
  eventId: 'e1',
  start: new Date(2026, 10, 16, 10).toISOString(),
  end: new Date(2026, 10, 16, 11).toISOString(),
} as Occurrence;

test('snap rounds to 15 minutes', () => {
  expect(snap(7)).toBe(0);
  expect(snap(8)).toBe(15);
  expect(snap(-22)).toBe(-15);
});

describe('slotAt', () => {
  const rect = { left: 0, top: 0, width: 300 };
  test('finds the day column and snapped minute', () => {
    expect(slotAt(rect, { clientX: 150, clientY: 48 * 9 + 20 }, 3, false)).toEqual({ day: 1, min: 9 * 60 + 30 });
  });
  test('right to left counts days from the right', () => {
    expect(slotAt(rect, { clientX: 10, clientY: 0 }, 3, true).day).toBe(2);
  });
  test('stays inside the grid', () => {
    expect(slotAt(rect, { clientX: 999, clientY: 99_999 }, 3, false)).toEqual({ day: 2, min: 24 * 60 });
  });
});

describe('dragOutcome', () => {
  test('a tap on empty space creates an hour', () => {
    const d: Drag = { kind: 'create', day: 1, from: 540, to: 540, moved: false, touch: false };
    expect(dragOutcome(d, days)).toEqual({
      kind: 'create',
      start: new Date(2026, 10, 17, 9),
      end: new Date(2026, 10, 17, 10),
    });
  });
  test('a zero-length drag still makes 15 minutes', () => {
    const d = dragTo({ kind: 'create', day: 0, from: 600, to: 600, moved: false, touch: false }, { day: 0, min: 600 });
    expect(dragOutcome({ ...d, moved: true }, days)).toMatchObject({
      start: new Date(2026, 10, 16, 10),
      end: new Date(2026, 10, 16, 10, 15),
    });
  });
  test('touch creates do not stretch', () => {
    const d: Drag = { kind: 'create', day: 0, from: 600, to: 600, moved: false, touch: true };
    expect(dragTo(d, { day: 0, min: 700 })).toBe(d);
  });
  test('a move without movement opens the event', () => {
    const d: Drag = { kind: 'move', o, grabDay: 0, grabMin: 610, day: 0, min: 610, moved: false };
    expect(dragOutcome(d, days)).toEqual({ kind: 'open', o });
  });
  test('moving keeps the length and moves by calendar days', () => {
    const d = dragTo(
      { kind: 'move', o, grabDay: 0, grabMin: 610, day: 0, min: 610, moved: false },
      { day: 2, min: 700 },
    );
    expect(dragOutcome(d, days)).toEqual({
      kind: 'change',
      o,
      start: new Date(2026, 10, 18, 11, 30),
      end: new Date(2026, 10, 18, 12, 30),
    });
  });
  test('resizing never goes shorter than 15 minutes', () => {
    const d = dragTo({ kind: 'resize', o, day: 0, min: 660, moved: false }, { day: 0, min: 540 });
    expect(dragOutcome(d, days)).toMatchObject({ end: new Date(2026, 10, 16, 10, 15) });
  });
});

test('the ghost follows a move', () => {
  const d = dragTo({ kind: 'move', o, grabDay: 0, grabMin: 610, day: 0, min: 610, moved: false }, { day: 1, min: 640 });
  expect(dragGhost(d, days)).toEqual({ day: 1, from: 630, to: 690 });
  expect(dragGhost(undefined, days)).toBeUndefined();
});

test('blocks are at least 18 pixels tall', () => {
  expect(blockBox(60, 65)).toEqual({ top: 48, height: 18 });
});

test('the grid opens an hour before now on today', () => {
  expect(initialScrollHour(days, new Date(2026, 10, 17, 14))).toBe(13);
  expect(initialScrollHour(days, new Date(2026, 11, 1))).toBe(7);
});
