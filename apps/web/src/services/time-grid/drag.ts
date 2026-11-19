// Dragging in the day and week time grid: where the pointer is, how a drag changes as it moves,
// and what it does when it ends. Pure; the grid component feeds it pointer positions. Days are wall
// dates in zone `tz`; outcomes are real instants.
import type { Occurrence } from '@/schemas';
import { addDays, addMinutes, MINUTE, minutesFrom, sameDay, startOfDay, wallSpan } from '@/services/dates';
import { instantOf } from '@/services/zones';

export const HOUR_PX = 48;
export const DAY_MINUTES = 24 * 60;
export const SNAP_MINUTES = 15;
/** The shortest event a drag makes. */
export const MIN_MINUTES = 15;

export type Slot = { day: number; min: number };

export type Drag =
  | { kind: 'create'; day: number; from: number; to: number; moved: boolean; touch: boolean }
  | { kind: 'move'; o: Occurrence; grabDay: number; grabMin: number; day: number; min: number; moved: boolean }
  | { kind: 'resize'; o: Occurrence; day: number; min: number; moved: boolean };

export type DragOutcome =
  | { kind: 'create'; start: Date; end: Date }
  | { kind: 'open'; o: Occurrence }
  | { kind: 'change'; o: Occurrence; start: Date; end: Date };

export type Ghost = { day: number; from: number; to: number };

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export const snap = (minutes: number, to = SNAP_MINUTES): number => Math.round(minutes / to) * to;

/** The day column and snapped minute under a point, in a grid laid out in `rect`. */
export function slotAt(
  rect: { left: number; top: number; width: number },
  point: { clientX: number; clientY: number },
  dayCount: number,
  rtl: boolean,
): Slot {
  let day = Math.floor(((point.clientX - rect.left) / rect.width) * dayCount);
  if (rtl) day = dayCount - 1 - day;
  return {
    day: clamp(day, 0, dayCount - 1),
    min: clamp(snap(((point.clientY - rect.top) / HOUR_PX) * 60), 0, DAY_MINUTES),
  };
}

/** The drag after the pointer moves to `slot`. Touch creates don't stretch: on touch, dragging scrolls. */
export function dragTo(d: Drag, slot: Slot): Drag {
  if (d.kind === 'create') return d.touch ? d : { ...d, to: slot.min, moved: d.moved || slot.min !== d.from };
  return { ...d, day: slot.day, min: slot.min, moved: d.moved || slot.day !== d.day || slot.min !== d.min };
}

/** What a finished drag does: a tap creates an hour or opens the event; a real drag creates or changes. */
export function dragOutcome(d: Drag, days: readonly Date[], tz: string): DragOutcome | undefined {
  if (d.kind === 'create') {
    const day = days[d.day];
    if (!day) return undefined;
    const [a, b] = d.moved ? [Math.min(d.from, d.to), Math.max(d.from, d.to)] : [d.from, d.from + 60];
    const start = instantOf(addMinutes(day, a), tz);
    return { kind: 'create', start, end: instantOf(addMinutes(day, Math.max(b, a + MIN_MINUTES)), tz) };
  }
  if (!d.moved) return { kind: 'open', o: d.o };
  const s = wallSpan(d.o, tz).start;
  const length = new Date(d.o.end).getTime() - new Date(d.o.start).getTime();
  if (d.kind === 'move') {
    // Moves in wall time, so 09:00 stays 09:00 across a clock change; the length stays the same.
    const start = instantOf(addMinutes(addDays(s, d.day - d.grabDay), d.min - d.grabMin), tz);
    return { kind: 'change', o: d.o, start, end: new Date(start.getTime() + length) };
  }
  const day = days[d.day];
  if (!day) return undefined;
  const end = new Date(Math.max(addMinutes(day, d.min).getTime(), addMinutes(s, MIN_MINUTES).getTime()));
  return { kind: 'change', o: d.o, start: new Date(d.o.start), end: instantOf(end, tz) };
}

/** Where the dragged event would land, for the preview block; undefined until the pointer moves. */
export function dragGhost(d: Drag | undefined, days: readonly Date[], tz: string): Ghost | undefined {
  if (!d?.moved) return undefined;
  if (d.kind === 'create') return { day: d.day, from: Math.min(d.from, d.to), to: Math.max(d.from, d.to) };
  const s = wallSpan(d.o, tz).start;
  const startMin = minutesFrom(startOfDay(s), s);
  if (d.kind === 'move') {
    const length = (new Date(d.o.end).getTime() - new Date(d.o.start).getTime()) / MINUTE;
    const from = startMin + (d.min - d.grabMin);
    return { day: d.day, from, to: from + length };
  }
  const day = days.findIndex((x) => sameDay(x, s));
  return { day: day < 0 ? d.day : day, from: startMin, to: Math.max(d.min, startMin + MIN_MINUTES) };
}

/** Blocks shorter than this can't fit the title and the time on two lines, so they use one. */
export const TWO_LINE_PX = 36;

/** Top and height in pixels for minutes [from, to) of a day, never shorter than a line of text. */
export function blockBox(from: number, to: number): { top: number; height: number } {
  const a = clamp(from, 0, DAY_MINUTES);
  const b = clamp(to, 0, DAY_MINUTES);
  return { top: (a / 60) * HOUR_PX, height: Math.max(((b - a) / 60) * HOUR_PX, 18) };
}

/** Where the grid starts scrolled: an hour before now (a wall time) when today is shown, else 07:00. */
export function initialScrollHour(days: readonly Date[], now: Date): number {
  return days.some((d) => sameDay(d, now)) ? Math.max(0, now.getUTCHours() - 1) : 7;
}
