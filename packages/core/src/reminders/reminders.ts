// Reminder times. See docs/design/phase-4a-reminders.md ("Time zones and DST").
//
// An event reminder is an offset before each occurrence's start. Offsets of whole days are nominal
// (wall-clock days in the event's zone), so "1 day before 09:00" stays at 09:00 across a clock
// change; any rest is exact minutes. All-day events start at midnight in the user's home zone.
import { expand } from '../recurrence';

export const REMINDER_LIMITS = {
  /** Most reminders on one event (Google's limit too). */
  perEvent: 5,
  /** Longest offset, in minutes: 4 weeks. */
  maxMinutes: 40_320,
  /** Most standalone reminders a user can have open. */
  standalonePerUser: 500,
  title: 200,
  /** A reminder this late (the worker was down) is still sent; older ones are skipped. */
  catchUpMs: 3_600_000,
} as const;

const DAY_MIN = 1440;

/** Offsets sorted, without duplicates. */
export const normalizeReminders = (minutes: readonly number[]): number[] => [...new Set(minutes)].sort((a, b) => a - b);

export type ReminderTarget = {
  /** The occurrence's start (for all-day events, UTC midnight of its date). */
  start: Date;
  allDay: boolean;
  /** The event's IANA zone. */
  tz: string;
  /** The user's home zone, for all-day events; null means UTC. */
  homeTz: string | null;
};

/**
 * When a reminder `minutes` before the occurrence fires.
 * @example fireAt({ start, allDay: false, tz: 'Europe/London', homeTz: null }, 1440) // 09:00 the day before
 */
export function fireAt(target: ReminderTarget, minutes: number): Date {
  const start = target.allDay
    ? Temporal.PlainDate.from({
        year: target.start.getUTCFullYear(),
        month: target.start.getUTCMonth() + 1,
        day: target.start.getUTCDate(),
      }).toZonedDateTime(target.homeTz ?? 'UTC')
    : Temporal.Instant.fromEpochMilliseconds(target.start.getTime()).toZonedDateTimeISO(target.tz);
  const fired = start.subtract({ days: Math.floor(minutes / DAY_MIN) }).subtract({ minutes: minutes % DAY_MIN });
  return new Date(fired.epochMilliseconds);
}

export type StandaloneSchedule = { startsAt: Date; tz: string; rrule: string | null };

/** Search window for the next repeat: a yearly rule has one within two years. */
const NEXT_WINDOW_MS = 2 * 366 * 86_400_000;

/** The first time the standalone reminder fires after `after`, or null if it never does again. */
export function nextStandaloneFire(s: StandaloneSchedule, after: Date): Date | null {
  if (!s.rrule) return s.startsAt > after ? s.startsAt : null;
  const from = s.startsAt > after ? s.startsAt : after;
  const occurrences = expand(
    { start: s.startsAt, end: new Date(s.startsAt.getTime() + 1000), tz: s.tz, rrule: s.rrule, exdates: [] },
    from,
    new Date(from.getTime() + NEXT_WINDOW_MS),
  );
  return occurrences.find((o) => o.start > after)?.start ?? null;
}
