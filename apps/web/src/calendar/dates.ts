// Date helpers for the calendar views. Views work in the browser's local time; all-day events
// are stored as UTC midnights and shown on the same calendar dates wherever you are.

export type View = 'day' | 'week' | 'month' | 'year' | 'agenda';
export const VIEWS: View[] = ['day', 'week', 'month', 'year', 'agenda'];

export const MINUTE = 60_000;
export const DAY = 86_400_000;
export const SNAP_MINUTES = 15;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Moves by calendar days, keeping the local time of day (so across a clock change too). */
export const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
export const addMinutes = (d: Date, n: number) => new Date(d.getTime() + n * MINUTE);
export const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export const startOfWeek = (d: Date, weekStart: number) => addDays(startOfDay(d), -((d.getDay() - weekStart + 7) % 7));

/** YYYY-MM-DD in local time, for URLs and date inputs. */
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseIsoDate = (s: string | undefined) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : startOfDay(new Date());
};
/** YYYY-MM-DDTHH:mm in local time, for datetime-local inputs. */
export const isoLocal = (d: Date) =>
  `${isoDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** The days to show for the month of `ref`: whole weeks, starting on `weekStart` (0 = Sunday). */
export function monthGrid(ref: Date, weekStart: number) {
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const start = startOfWeek(first, weekStart);
  const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const weeks = Math.ceil((((first.getDay() - weekStart + 7) % 7) + last.getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

/** The time range a view fetches and the days it lays out. */
export function rangeFor(view: View, date: Date, weekStart: number) {
  const d = startOfDay(date);
  const span = (from: Date, n: number) => ({
    from,
    to: addDays(from, n),
    days: Array.from({ length: n }, (_, i) => addDays(from, i)),
  });
  switch (view) {
    case 'day':
      return span(d, 1);
    case 'week':
      return span(startOfWeek(d, weekStart), 7);
    case 'month': {
      const days = monthGrid(d, weekStart);
      return { from: days[0] as Date, to: addDays(days.at(-1) as Date, 1), days };
    }
    case 'year': {
      const from = new Date(d.getFullYear(), 0, 1);
      return { from, to: new Date(d.getFullYear() + 1, 0, 1), days: [] };
    }
    case 'agenda':
      return span(d, 30);
  }
}

/** The date to go to for "previous" (-1) or "next" (+1) in a view. */
export function step(view: View, date: Date, dir: 1 | -1) {
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

export const snap = (minutes: number, to = SNAP_MINUTES) => Math.round(minutes / to) * to;

/** An occurrence's start and end as local times; all-day ones are moved from UTC midnights to local ones. */
export function localSpan(o: { start: string; end: string; allDay: boolean }) {
  const s = new Date(o.start);
  const e = new Date(o.end);
  if (!o.allDay) return { start: s, end: e };
  return {
    start: new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()),
    end: new Date(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()),
  };
}

/** UTC midnight of a local calendar date: how all-day events are stored. */
export const utcMidnight = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

/** True if [start, end) touches the local day `day`. */
export const touchesDay = (span: { start: Date; end: Date }, day: Date) =>
  span.start < addDays(day, 1) && (span.end > day || span.start.getTime() === span.end.getTime());

export type Placed<T> = T & { col: number; cols: number };

/**
 * Side-by-side columns for overlapping timed events in one day: each cluster of overlapping
 * events shares its width equally, each event in the first column where it fits.
 */
export function layoutColumns<T extends { start: Date; end: Date }>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const p of cluster) p.cols = colEnds.length;
    out.push(...cluster);
    cluster = [];
    colEnds = [];
  };
  for (const item of sorted) {
    if (item.start.getTime() >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= item.start.getTime());
    if (col === -1) col = colEnds.length;
    colEnds[col] = item.end.getTime();
    cluster.push({ ...item, col, cols: 0 });
    clusterEnd = Math.max(clusterEnd, item.end.getTime());
  }
  flush();
  return out;
}

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

/** The simple repeat choice an RRULE matches, or 'custom' for anything else. */
export function repeatOf(rrule: string | null | undefined): Repeat {
  if (!rrule) return 'none';
  const m = rrule.match(/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)$/);
  return m ? ((m[1] as string).toLowerCase() as Repeat) : 'custom';
}

export const rruleOf = (repeat: Repeat, current: string | null) =>
  repeat === 'none' ? null : repeat === 'custom' ? current : `FREQ=${repeat.toUpperCase()}`;
