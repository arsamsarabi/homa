import { describe, expect, test } from 'bun:test';
import type { Occurrence } from '@/schemas';
import { instantOf } from '@/services/zones';
import {
  blockBox,
  type Drag,
  draftGhost,
  dragGhost,
  dragOutcome,
  dragTo,
  initialScrollTop,
  scrollTopForNow,
  slotAt,
  snap,
} from './drag';

// Days are wall dates in Tehran (UTC+3:30); outcomes are instants.
const TZ = 'Asia/Tehran';
const wall = (d: number, h = 0, m = 0): Date => new Date(Date.UTC(2026, 10, d, h, m));
const at = (d: number, h: number, m = 0): Date => instantOf(wall(d, h, m), TZ);
const days = [wall(16), wall(17), wall(18)];
const o = {
  eventId: 'e1',
  start: at(16, 10).toISOString(),
  end: at(16, 11).toISOString(),
  allDay: false,
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
    expect(dragOutcome(d, days, TZ)).toEqual({
      kind: 'create',
      start: at(17, 9),
      end: at(17, 10),
    });
  });
  test('a zero-length drag still makes 15 minutes', () => {
    const d = dragTo({ kind: 'create', day: 0, from: 600, to: 600, moved: false, touch: false }, { day: 0, min: 600 });
    expect(dragOutcome({ ...d, moved: true }, days, TZ)).toMatchObject({
      start: at(16, 10),
      end: at(16, 10, 15),
    });
  });
  test('touch creates do not stretch', () => {
    const d: Drag = { kind: 'create', day: 0, from: 600, to: 600, moved: false, touch: true };
    expect(dragTo(d, { day: 0, min: 700 })).toBe(d);
  });
  test('a move without movement opens the event', () => {
    const d: Drag = { kind: 'move', o, grabDay: 0, grabMin: 610, day: 0, min: 610, moved: false };
    expect(dragOutcome(d, days, TZ)).toEqual({ kind: 'open', o });
  });
  test('moving keeps the length and moves by calendar days', () => {
    const d = dragTo(
      { kind: 'move', o, grabDay: 0, grabMin: 610, day: 0, min: 610, moved: false },
      { day: 2, min: 700 },
    );
    expect(dragOutcome(d, days, TZ)).toEqual({
      kind: 'change',
      o,
      start: at(18, 11, 30),
      end: at(18, 12, 30),
    });
  });
  test('resizing never goes shorter than 15 minutes', () => {
    const d = dragTo({ kind: 'resize', o, day: 0, min: 660, moved: false }, { day: 0, min: 540 });
    expect(dragOutcome(d, days, TZ)).toMatchObject({ end: at(16, 10, 15) });
  });
});

test('the ghost follows a move', () => {
  const d = dragTo({ kind: 'move', o, grabDay: 0, grabMin: 610, day: 0, min: 610, moved: false }, { day: 1, min: 640 });
  expect(dragGhost(d, days, TZ)).toEqual({ day: 1, from: 630, to: 690 });
  expect(dragGhost(undefined, days, TZ)).toBeUndefined();
});

test('blocks are at least 18 pixels tall', () => {
  expect(blockBox(60, 65)).toEqual({ top: 48, height: 18 });
});

describe('scrollTopForNow', () => {
  test('centers now in the viewport', () => {
    // 14:30 → 14.5 * 48 = 696px; viewport 400 → top = 696 - 200 = 496
    expect(scrollTopForNow({ nowOffsetPx: 14.5 * 48, viewportHeight: 400, maxScroll: 2000 })).toBe(496);
  });
  test('clamps to the top of the day', () => {
    expect(scrollTopForNow({ nowOffsetPx: 30, viewportHeight: 400, maxScroll: 2000 })).toBe(0);
  });
  test('clamps to the bottom of the day', () => {
    expect(scrollTopForNow({ nowOffsetPx: 23 * 48, viewportHeight: 400, maxScroll: 752 })).toBe(752);
  });
});

describe('initialScrollTop', () => {
  const content = 24 * 48;
  const viewport = 400;
  test('centers now when today is in view, including minutes', () => {
    // 14:30 wall → offset 696; centered → 496
    expect(initialScrollTop(days, wall(17, 14, 30), viewport, content)).toBe(496);
  });
  test('defaults to 07:00 at the top when today is not in view', () => {
    expect(initialScrollTop(days, wall(31, 14), viewport, content)).toBe(7 * 48);
  });
  test('clamps when now is near midnight', () => {
    const maxScroll = content - viewport;
    expect(initialScrollTop(days, wall(17, 23, 45), viewport, content)).toBe(maxScroll);
  });
});

describe('draftGhost', () => {
  test('places a new event on its day in the viewed zone', () => {
    expect(draftGhost({ start: at(17, 9, 30), end: at(17, 10, 45) }, days, TZ)).toEqual({ day: 1, from: 570, to: 645 });
  });

  test('cuts an event that runs past midnight at the end of its first day', () => {
    expect(draftGhost({ start: at(18, 23), end: at(19, 1) }, days, TZ)).toEqual({ day: 2, from: 1380, to: 1440 });
  });

  test('is undefined when the event starts outside the days in view', () => {
    expect(draftGhost({ start: at(20, 9), end: at(20, 10) }, days, TZ)).toBeUndefined();
  });
});
