import { expect, test } from 'bun:test';
import { CALENDAR_SHORTCUTS, directed, SHORTCUTS } from './shortcuts';

test('each key does one thing', () => {
  const keys = SHORTCUTS.map((s) => s.hotkey.toLowerCase());
  expect(new Set(keys).size).toBe(keys.length);
});

test('calendar shortcuts leave out the app-wide ones', () => {
  const commands: string[] = CALENDAR_SHORTCUTS.map((s) => s.command);
  expect(commands.includes('palette') || commands.includes('help')).toBe(false);
  expect(CALENDAR_SHORTCUTS.map((s) => s.command)).toContain('view.agenda');
  expect(CALENDAR_SHORTCUTS.map((s) => s.command)).toContain('view.workWeek');
});

test('arrows follow the reading direction', () => {
  expect(directed('previous', false)).toBe('previous');
  expect(directed('previous', true)).toBe('next');
  expect(directed('next', true)).toBe('previous');
  expect(directed('today', true)).toBe('today');
});
