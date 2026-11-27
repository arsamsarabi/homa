import { describe, expect, test } from 'bun:test';
import type { Notification } from '@/schemas';
import { arrivals, notificationTarget, relativeTime, splitNew } from './notifications';

const base: Notification = {
  id: 'n1',
  kind: 'event',
  title: 'Stand-up',
  start: '2026-11-20T23:30:00Z',
  allDay: false,
  eventId: 'e1',
  taskId: null,
  recurrenceId: null,
  fireAt: '2026-11-20T23:20:00Z',
  read: false,
};
const now = new Date('2026-11-20T09:00:00Z');
const today = new Date('2026-11-20T00:00:00Z');

describe('relativeTime', () => {
  test.each([
    ['2026-11-20T09:00:20Z', 'now'],
    ['2026-11-20T09:10:00Z', 'in 10 minutes'],
    ['2026-11-20T08:15:00Z', '45 minutes ago'],
    ['2026-11-20T12:00:00Z', 'in 3 hours'],
    ['2026-11-22T09:00:00Z', 'in 2 days'],
  ])('%s is %s', (at: string, text: string) => {
    expect(relativeTime(new Date(at), now, false, today, 'en')).toBe(text);
  });
  test('all-day dates count whole days from today', () => {
    expect(relativeTime(new Date('2026-11-21T00:00:00Z'), now, true, today, 'en')).toBe('tomorrow');
    expect(relativeTime(today, now, true, today, 'en')).toBe('today');
  });
});

describe('notificationTarget', () => {
  test("an event opens its day in the home zone, which can be the next day's", () => {
    expect(notificationTarget(base, 'UTC')).toEqual({ to: '/', search: { view: 'day', date: '2026-11-20' } });
    expect(notificationTarget(base, 'Asia/Tehran')).toEqual({ to: '/', search: { view: 'day', date: '2026-11-21' } });
  });
  test('an all-day event keeps its date; tasks and reminders open their pages', () => {
    const allDay = { ...base, allDay: true, start: '2026-11-25T00:00:00Z' };
    expect(notificationTarget(allDay, 'America/Los_Angeles')).toEqual({
      to: '/',
      search: { view: 'day', date: '2026-11-25' },
    });
    expect(notificationTarget({ ...base, kind: 'task' }, 'UTC')).toEqual({ to: '/tasks', search: { list: 'today' } });
    expect(notificationTarget({ ...base, kind: 'standalone' }, 'UTC')).toEqual({ to: '/reminders' });
  });
});

test('splitNew keeps order within each group', () => {
  const a = { ...base, id: 'a' };
  const b = { ...base, id: 'b' };
  const c = { ...base, id: 'c' };
  expect(splitNew([a, b, c], new Set(['a', 'c']))).toEqual({ fresh: [a, c], earlier: [b] });
});

test('arrivals are unread and not seen before', () => {
  const seen = { ...base, id: 'seen' };
  const read = { ...base, id: 'read', read: true };
  const fresh = { ...base, id: 'fresh' };
  expect(arrivals([seen, read, fresh], new Set(['seen']))).toEqual([fresh]);
});
