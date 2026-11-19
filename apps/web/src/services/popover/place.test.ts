import { expect, test } from 'bun:test';
import { placeBeside } from './place';

const viewport = { width: 1200, height: 800 };
const panel = { width: 380, height: 500 };

test('sits after the anchor when there is room', () => {
  expect(placeBeside({ top: 100, left: 200, width: 150, height: 40 }, panel, viewport, false)).toEqual({
    top: 100,
    left: 358,
  });
});

test('flips before the anchor near the inline end', () => {
  expect(placeBeside({ top: 100, left: 900, width: 150, height: 40 }, panel, viewport, false).left).toBe(512);
});

test('prefers the left side in right-to-left', () => {
  expect(placeBeside({ top: 100, left: 600, width: 150, height: 40 }, panel, viewport, true).left).toBe(212);
});

test('stays on screen vertically', () => {
  expect(placeBeside({ top: 700, left: 200, width: 150, height: 40 }, panel, viewport, false).top).toBe(292);
});

test('without room on either side it centers over the anchor, clamped', () => {
  const narrow = { width: 500, height: 800 };
  expect(placeBeside({ top: 10, left: 100, width: 300, height: 40 }, panel, narrow, false)).toEqual({
    top: 10,
    left: 60,
  });
});

test('without an anchor it centers near the top', () => {
  expect(placeBeside(undefined, panel, viewport, false)).toEqual({ top: 80, left: 410 });
});
