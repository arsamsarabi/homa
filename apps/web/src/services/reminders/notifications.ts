// The bell's rules: how far off a notification's time is, where clicking it goes, which ones are
// new, and which arrived since the last poll (for the in-app toast).
import type { Notification } from '@/schemas';
import { isoDate } from '@/services/dates';
import { wallOf } from '@/services/zones';

const MINUTE = 60_000;
const HOUR: number = 60 * MINUTE;
const DAY: number = 24 * HOUR;

/**
 * How far `at` is from `now`, as "in 10 minutes", "2 hours ago" or "tomorrow". All-day times count
 * whole days, from `today` (midnight UTC of the user's day, as all-day dates are stored).
 * @example relativeTime(new Date('2026-11-20T09:10Z'), new Date('2026-11-20T09:00Z'), false, today, 'en') // "in 10 minutes"
 */
export function relativeTime(at: Date, now: Date, allDay: boolean, today: Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (allDay) return rtf.format(Math.round((at.getTime() - today.getTime()) / DAY), 'day');
  const diff = at.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < MINUTE) return rtf.format(0, 'second');
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
  return rtf.format(Math.round(diff / DAY), 'day');
}

/** The first letter in upper case, for lines that can start with Intl's lowercase "yesterday". */
export const capitalize = (s: string, locale: string): string => s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);

export type NotificationTarget =
  | { to: '/'; search: { view: 'day'; date: string } }
  | { to: '/tasks'; search: { list: 'today' } }
  | { to: '/reminders' };

/** Where clicking a notification goes: its event's day, today's tasks, or the reminders page. */
export function notificationTarget(n: Notification, tz: string): NotificationTarget {
  if (n.kind === 'event') {
    const start = new Date(n.start);
    // An all-day start is its date at midnight UTC; a timed one is shown on its day in the home zone.
    return { to: '/', search: { view: 'day', date: isoDate(n.allDay ? start : wallOf(start, tz)) } };
  }
  if (n.kind === 'task') return { to: '/tasks', search: { list: 'today' } };
  return { to: '/reminders' };
}

/** Splits the list into the ones new when the bell opened and the rest, keeping their order. */
export function splitNew(
  items: readonly Notification[],
  newIds: ReadonlySet<string>,
): { fresh: Notification[]; earlier: Notification[] } {
  const fresh: Notification[] = [];
  const earlier: Notification[] = [];
  for (const n of items) (newIds.has(n.id) ? fresh : earlier).push(n);
  return { fresh, earlier };
}

/** Unread notifications not in `seen`: the ones that fired since the last poll. */
export const arrivals = (items: readonly Notification[], seen: ReadonlySet<string>): Notification[] =>
  items.filter((n) => !n.read && !seen.has(n.id));
