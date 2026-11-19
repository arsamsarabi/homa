import { expect, test } from 'bun:test';
import { instantOf, isTimeZone, wallOf } from './zones';

const utc = (s: string): Date => new Date(`${s}Z`);

test('wall time is the clock in the zone', () => {
  expect(wallOf(new Date('2026-07-01T08:00:00Z'), 'Europe/London')).toEqual(utc('2026-07-01T09:00:00'));
  expect(wallOf(new Date('2026-07-01T08:00:00Z'), 'Asia/Tehran')).toEqual(utc('2026-07-01T11:30:00'));
  expect(wallOf(new Date('2026-07-01T08:00:00.250Z'), 'UTC')).toEqual(utc('2026-07-01T08:00:00.250'));
});

test('wall time back to an instant', () => {
  expect(instantOf(utc('2026-07-01T09:00:00'), 'Europe/London')).toEqual(new Date('2026-07-01T08:00:00Z'));
  expect(instantOf(utc('2026-01-01T09:00:00'), 'America/New_York')).toEqual(new Date('2026-01-01T14:00:00Z'));
});

test('a skipped time moves on by the gap; a repeated one is the earlier', () => {
  // London springs forward at 01:00 on 29 March 2026; 01:30 doesn't exist and means 02:30 BST.
  expect(instantOf(utc('2026-03-29T01:30:00'), 'Europe/London')).toEqual(new Date('2026-03-29T01:30:00Z'));
  // It falls back at 02:00 on 25 October 2026; 01:30 happens twice, first in BST.
  expect(instantOf(utc('2026-10-25T01:30:00'), 'Europe/London')).toEqual(new Date('2026-10-25T00:30:00Z'));
});

test('round trips across the year', () => {
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 3_600_000 * 7) {
    const d = new Date(t);
    expect(instantOf(wallOf(d, 'America/Sao_Paulo'), 'America/Sao_Paulo')).toEqual(d);
  }
});

test('zones are checked', () => {
  expect(isTimeZone('Asia/Tehran')).toBe(true);
  expect(isTimeZone('Mars/Olympus')).toBe(false);
  expect(isTimeZone('')).toBe(false);
});
