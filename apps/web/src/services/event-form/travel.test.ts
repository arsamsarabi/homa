import { expect, test } from 'bun:test';
import { travelChoices, travelDuration } from './travel';

test('travel lengths read in short units', () => {
  expect(travelDuration(30, 'en')).toBe('30 min');
  expect(travelDuration(60, 'en')).toBe('1 hr');
  expect(travelDuration(90, 'en')).toBe('1 hr 30 min');
});

test('an unusual travel time is kept as a choice', () => {
  expect(travelChoices(45)).toEqual([5, 15, 30, 45, 60, 90, 120]);
  expect(travelChoices(null)).toEqual([5, 15, 30, 60, 90, 120]);
});
