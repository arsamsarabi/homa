// Which occurrences go where in each view. Pure, so views only render what these return.
import type { Occurrence } from '@/schemas';
import { addDays, DAY, isoDate, localSpan, type Span, startOfDay, touchesDay } from '@/services/dates';

export type Placed<T> = T & { col: number; cols: number };
export type TimedItem = Span & { o: Occurrence };
export type AgendaGroup = { day: Date; items: Occurrence[] };

/** Long or all-day occurrences go in the all-day row of the time grid; the rest in the grid. */
export const isAllDayRow = (o: Occurrence): boolean =>
  o.allDay || new Date(o.end).getTime() - new Date(o.start).getTime() >= DAY;

/**
 * Side-by-side columns for overlapping timed events in one day: each cluster of overlapping
 * events shares its width equally, each event in the first column where it fits.
 */
export function layoutColumns<T extends Span>(items: readonly T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = (): void => {
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

const onDay = (occ: readonly Occurrence[], day: Date): Occurrence[] => occ.filter((o) => touchesDay(localSpan(o), day));

/** The time grid's all-day row: for each day, the long and all-day occurrences on it. */
export const allDayRowItems = (days: readonly Date[], occ: readonly Occurrence[]): Occurrence[][] => {
  const long = occ.filter(isAllDayRow);
  return days.map((d) => onDay(long, d));
};

/** The time grid's columns: for each day, its timed occurrences placed side by side. */
export const timedColumnItems = (days: readonly Date[], occ: readonly Occurrence[]): Placed<TimedItem>[][] => {
  const timed = occ.filter((o) => !isAllDayRow(o)).map((o): TimedItem => ({ o, ...localSpan(o) }));
  return days.map((d) => layoutColumns(timed.filter((x) => touchesDay(x, d))));
};

/** A month cell's occurrences: all-day ones first, then by start. */
export const monthCellItems = (days: readonly Date[], occ: readonly Occurrence[]): Occurrence[][] =>
  days.map((d) => onDay(occ, d).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start)));

/** The YYYY-MM-DD dates that have at least one occurrence, for the year view's dots. */
export function busyDates(occ: readonly Occurrence[]): Set<string> {
  const busy = new Set<string>();
  for (const o of occ) {
    const { start, end } = localSpan(o);
    // Mark each day the occurrence touches; the guard keeps a runaway span from looping long.
    for (let d = startOfDay(start), n = 0; (d < end || n === 0) && n < 400; d = addDays(d, 1), n++) {
      busy.add(isoDate(d));
    }
  }
  return busy;
}

/** The agenda: days that have occurrences, each with its occurrences. */
export const agendaGroups = (days: readonly Date[], occ: readonly Occurrence[]): AgendaGroup[] =>
  days.map((day) => ({ day, items: onDay(occ, day) })).filter((g) => g.items.length > 0);
