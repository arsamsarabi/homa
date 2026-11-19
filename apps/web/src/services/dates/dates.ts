// Date math for the calendar views. Views work in the browser's local time; all-day events are
// stored as UTC midnights and shown on the same calendar dates wherever you are.
import type { View } from '@/schemas';

export const MINUTE = 60_000;
export const DAY = 86_400_000;

export type Span = { start: Date; end: Date };
export type DayRange = { from: Date; to: Date; days: Date[] };

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Moves by calendar days, keeping the local time of day (so across a clock change too). */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export const addMinutes = (d: Date, n: number): Date => new Date(d.getTime() + n * MINUTE);
export const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();
export const startOfWeek = (d: Date, weekStart: number): Date =>
  addDays(startOfDay(d), -((d.getDay() - weekStart + 7) % 7));

/** Whole minutes from `day` (a local midnight) to `d`. */
export const minutesFrom = (day: Date, d: Date): number => Math.round((d.getTime() - day.getTime()) / MINUTE);

const pad = (n: number): string => String(n).padStart(2, '0');

/** YYYY-MM-DD in local time, for URLs and date inputs. */
export const isoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The local date for YYYY-MM-DD, or today when `s` is missing or malformed. */
export function parseIsoDate(s: string | undefined): Date {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : startOfDay(new Date());
}

/** YYYY-MM-DDTHH:mm in local time, for datetime-local inputs. */
export const isoLocal = (d: Date): string => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The days to show for the month of `ref`: whole weeks, starting on `weekStart` (0 = Sunday). */
export function monthGrid(ref: Date, weekStart: number): Date[] {
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const start = startOfWeek(first, weekStart);
  const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const weeks = Math.ceil((((first.getDay() - weekStart + 7) % 7) + last.getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

const span = (from: Date, n: number): DayRange => ({
  from,
  to: addDays(from, n),
  days: Array.from({ length: n }, (_, i) => addDays(from, i)),
});

/** The time range a view fetches and the days it lays out. */
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
      return { from: new Date(d.getFullYear(), 0, 1), to: new Date(d.getFullYear() + 1, 0, 1), days: [] };
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
      return new Date(date.getFullYear(), date.getMonth() + dir, 1);
    case 'year':
      return new Date(date.getFullYear() + dir, 0, 1);
    case 'agenda':
      return addDays(date, 30 * dir);
  }
}

/** An occurrence's start and end as local times; all-day ones move from UTC midnights to local ones. */
export function localSpan(o: { start: string; end: string; allDay: boolean }): Span {
  const s = new Date(o.start);
  const e = new Date(o.end);
  if (!o.allDay) return { start: s, end: e };
  return {
    start: new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()),
    end: new Date(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()),
  };
}

/** UTC midnight of a local calendar date: how all-day events are stored. */
export const utcMidnight = (d: Date): Date => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

/** True if [start, end) touches the local day `day` (a zero-length span counts on its day). */
export const touchesDay = (s: Span, day: Date): boolean =>
  s.start < addDays(day, 1) && (s.end > day || s.start.getTime() === s.end.getTime());

/** Whole calendar days from `from` to `to` (local dates). */
export const daysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);
