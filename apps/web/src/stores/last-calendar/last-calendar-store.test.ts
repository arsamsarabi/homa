import { describe, expect, test } from 'bun:test';
import { defaultCalendarId } from './last-calendar-store';

describe('defaultCalendarId', () => {
  test('is the last one used while it is writable, else the first writable one', () => {
    expect(defaultCalendarId(['a', 'b'], 'b')).toBe('b');
    expect(defaultCalendarId(['a', 'b'], 'gone')).toBe('a');
    expect(defaultCalendarId(['a', 'b'], undefined)).toBe('a');
    expect(defaultCalendarId([], 'b')).toBeUndefined();
  });
});
