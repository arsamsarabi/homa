// Reminder offsets and snooze times: pure rules for the reminder chips, the bell and push.
import { instantOf, wallOf } from '@/services/zones';

/** The offsets the event form offers, in minutes before the start. */
export const REMINDER_PRESETS: readonly number[] = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
/** Most reminders on one event (the API's limit). */
export const MAX_REMINDERS = 5;
/** The default reminder when the user hasn't chosen one. */
export const DEFAULT_REMINDER = 10;

export type OffsetLabel = { key: 'atStart' } | { key: 'minutes' | 'hours' | 'days' | 'weeks'; count: number };

/** How to name an offset: the largest whole unit. */
export function offsetLabel(minutes: number): OffsetLabel {
  if (minutes === 0) return { key: 'atStart' };
  if (minutes % 10080 === 0) return { key: 'weeks', count: minutes / 10080 };
  if (minutes % 1440 === 0) return { key: 'days', count: minutes / 1440 };
  if (minutes % 60 === 0) return { key: 'hours', count: minutes / 60 };
  return { key: 'minutes', count: minutes };
}

/** The chips to show: the presets plus any other offset the event already has, sorted. */
export const reminderChoices = (current: readonly number[]): number[] =>
  [...new Set([...REMINDER_PRESETS, ...current])].sort((a, b) => a - b);

/** Toggles an offset, keeping at most MAX_REMINDERS (a sixth isn't added). */
export function toggleReminder(current: readonly number[], minutes: number): number[] {
  if (current.includes(minutes)) return current.filter((m) => m !== minutes);
  if (current.length >= MAX_REMINDERS) return [...current];
  return [...current, minutes].sort((a, b) => a - b);
}

export const SNOOZES = ['5', '10', '30', '60', 'tomorrow'] as const;
export type Snooze = (typeof SNOOZES)[number];

/** When a snooze ends: minutes from now, or tomorrow at 09:00 in `tz`. */
export function snoozeUntil(snooze: Snooze, now: Date, tz: string): Date {
  if (snooze !== 'tomorrow') return new Date(now.getTime() + Number(snooze) * 60_000);
  const wall = wallOf(now, tz);
  return instantOf(new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1, 9)), tz);
}

/** A VAPID public key (base64url) as PushManager.subscribe wants it. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** True if two keys are the same bytes. */
export const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** A notification's time: the date for all-day ones, else the date and time in `tz`. */
export function formatWhen(at: Date, allDay: boolean, locale: string, tz: string): string {
  return new Intl.DateTimeFormat(
    locale,
    allDay ? { dateStyle: 'medium', timeZone: 'UTC' } : { dateStyle: 'medium', timeStyle: 'short', timeZone: tz },
  ).format(at);
}
