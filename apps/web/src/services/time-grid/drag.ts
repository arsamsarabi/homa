// Dragging in the day and week time grid: where the pointer is, how a drag changes as it moves,
// and what it does when it ends. Pure; the grid component feeds it pointer positions.
import type { Occurrence } from '@/schemas';
import { addDays, addMinutes, MINUTE, minutesFrom, sameDay, startOfDay } from '@/services/dates';

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
export function dragOutcome(d: Drag, days: readonly Date[]): DragOutcome | undefined {
  if (d.kind === 'create') {
    const day = days[d.day];
    if (!day) return undefined;
    const [a, b] = d.moved ? [Math.min(d.from, d.to), Math.max(d.from, d.to)] : [d.from, d.from + 60];
    return { kind: 'create', start: addMinutes(day, a), end: addMinutes(day, Math.max(b, a + MIN_MINUTES)) };
  }
  if (!d.moved) return { kind: 'open', o: d.o };
  const s = new Date(d.o.start);
  const e = new Date(d.o.end);
  if (d.kind === 'move') {
    // Whole days move by calendar day, so 09:00 stays 09:00 across a clock change.
    const start = addMinutes(addDays(s, d.day - d.grabDay), d.min - d.grabMin);
    return { kind: 'change', o: d.o, start, end: new Date(start.getTime() + (e.getTime() - s.getTime())) };
  }
  const day = days[d.day];
  if (!day) return undefined;
  const end = new Date(Math.max(addMinutes(day, d.min).getTime(), addMinutes(s, MIN_MINUTES).getTime()));
  return { kind: 'change', o: d.o, start: s, end };
}

/** Where the dragged event would land, for the preview block; undefined until the pointer moves. */
export function dragGhost(d: Drag | undefined, days: readonly Date[]): Ghost | undefined {
  if (!d?.moved) return undefined;
  if (d.kind === 'create') return { day: d.day, from: Math.min(d.from, d.to), to: Math.max(d.from, d.to) };
  const s = new Date(d.o.start);
  const startMin = minutesFrom(startOfDay(s), s);
  if (d.kind === 'move') {
    const length = (new Date(d.o.end).getTime() - s.getTime()) / MINUTE;
    const from = startMin + (d.min - d.grabMin);
    return { day: d.day, from, to: from + length };
  }
  const day = days.findIndex((x) => sameDay(x, s));
  return { day: day < 0 ? d.day : day, from: startMin, to: Math.max(d.min, startMin + MIN_MINUTES) };
}

/** Top and height in pixels for minutes [from, to) of a day, never shorter than a line of text. */
export function blockBox(from: number, to: number): { top: number; height: number } {
  const a = clamp(from, 0, DAY_MINUTES);
  const b = clamp(to, 0, DAY_MINUTES);
  return { top: (a / 60) * HOUR_PX, height: Math.max(((b - a) / 60) * HOUR_PX, 18) };
}

/** Where the grid starts scrolled: an hour before now when today is shown, else 07:00. */
export function initialScrollHour(days: readonly Date[], now: Date): number {
  return days.some((d) => sameDay(d, now)) ? Math.max(0, now.getHours() - 1) : 7;
}
