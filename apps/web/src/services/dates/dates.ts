// Date math for the calendar views, on wall times (see @/services/zones): Dates whose UTC fields
// are the clock and calendar in the zone being viewed. All-day events are stored as UTC midnights,
// which are already wall dates.
import type { View } from '@/schemas';
import { wallOf } from '@/services/zones';

export const MINUTE = 60_000;
export const DAY = 86_400_000;

export type Span = { start: Date; end: Date };
export type DayRange = { from: Date; to: Date; days: Date[] };

export const startOfDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY);
export const addMinutes = (d: Date, n: number): Date => new Date(d.getTime() + n * MINUTE);
export const sameDay = (a: Date, b: Date): boolean => startOfDay(a).getTime() === startOfDay(b).getTime();
export const startOfWeek = (d: Date, weekStart: number): Date =>
  addDays(startOfDay(d), -((d.getUTCDay() - weekStart + 7) % 7));

/** Today's date in `tz`. */
export const today = (tz: string): Date => startOfDay(wallOf(new Date(), tz));

/** Whole minutes from `day` (a midnight) to `d`. */
export const minutesFrom = (day: Date, d: Date): number => Math.round((d.getTime() - day.getTime()) / MINUTE);

const pad = (n: number): string => String(n).padStart(2, '0');

/** YYYY-MM-DD, for URLs and date inputs. */
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** The date for YYYY-MM-DD, or `fallback` when `s` is missing or malformed. */
export function parseIsoDate(s: string | undefined, fallback: Date): Date {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : fallback;
}

/** YYYY-MM-DDTHH:mm, for datetime-local inputs. */
export const isoLocal = (d: Date): string => `${isoDate(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

/** The wall time a datetime-local value (YYYY-MM-DDTHH:mm) names, or undefined. */
export function parseIsoLocal(s: string): Date | undefined {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))) : undefined;
}

const firstOfMonth = (year: number, month: number): Date => new Date(Date.UTC(year, month, 1));

/** The days to show for the month of `ref`: whole weeks, starting on `weekStart` (0 = Sunday). */
export function monthGrid(ref: Date, weekStart: number): Date[] {
  const first = firstOfMonth(ref.getUTCFullYear(), ref.getUTCMonth());
  const start = startOfWeek(first, weekStart);
  const length = addDays(firstOfMonth(ref.getUTCFullYear(), ref.getUTCMonth() + 1), -1).getUTCDate();
  const weeks = Math.ceil((((first.getUTCDay() - weekStart + 7) % 7) + length) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

const span = (from: Date, n: number): DayRange => ({
  from,
  to: addDays(from, n),
  days: Array.from({ length: n }, (_, i) => addDays(from, i)),
});

/** The dates a view fetches and the days it lays out. */
export function rangeFor(view: View, date: Date, weekStart: number): DayRange {
  const d = startOfDay(date);
  switch (view) {
    case 'day':
      return span(d, 1);
    case 'week':
      return span(startOfWeek(d, weekStart), 7);
    case 'month': {
      const days = monthGrid(d, weekStart);
      return { from: days[0] ?? d, to: addDays(days.at(-1) ?? d, 1), days };
    }
    case 'year':
      return { from: firstOfMonth(d.getUTCFullYear(), 0), to: firstOfMonth(d.getUTCFullYear() + 1, 0), days: [] };
    case 'agenda':
      return span(d, 30);
  }
}

/** The date to go to for "previous" (-1) or "next" (+1) in a view. */
export function step(view: View, date: Date, dir: 1 | -1): Date {
  switch (view) {
    case 'day':
      return addDays(date, dir);
    case 'week':
      return addDays(date, 7 * dir);
    case 'month':
      return firstOfMonth(date.getUTCFullYear(), date.getUTCMonth() + dir);
    case 'year':
      return firstOfMonth(date.getUTCFullYear() + dir, 0);
    case 'agenda':
      return addDays(date, 30 * dir);
  }
}

/** An occurrence's start and end as wall times in `tz`; all-day ones keep their dates. */
export function wallSpan(o: { start: string; end: string; allDay: boolean }, tz: string): Span {
  const s = new Date(o.start);
  const e = new Date(o.end);
  return o.allDay ? { start: s, end: e } : { start: wallOf(s, tz), end: wallOf(e, tz) };
}

/** True if [start, end) touches the day `day` (a zero-length span counts on its day). */
export const touchesDay = (s: Span, day: Date): boolean =>
  s.start < addDays(day, 1) && (s.end > day || s.start.getTime() === s.end.getTime());

/** Whole calendar days from `from` to `to`. */
export const daysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);
