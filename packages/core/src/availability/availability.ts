// Pure free/busy helpers for the availability API (phase 6c). Clip, merge and invert intervals;
// the service loads occurrences and calls these so free/busy never disagrees with the views.

/** A half-open busy or free interval [start, end). */
export type Interval = { start: Date; end: Date };

const MINUTE_MS = 60_000;

/**
 * Clip intervals to [from, to), drop empties, merge overlapping or touching ones, and sort by start.
 *
 * @example
 * mergeBusy([{ start, end }], from, to)
 */
export function mergeBusy(intervals: readonly Interval[], from: Date, to: Date): Interval[] {
  const clipped: Interval[] = [];
  for (const i of intervals) {
    const start = i.start > from ? i.start : from;
    const end = i.end < to ? i.end : to;
    if (end > start) clipped.push({ start, end });
  }
  clipped.sort((a, b) => a.start.getTime() - b.start.getTime());

  const out: Interval[] = [];
  for (const i of clipped) {
    const last = out[out.length - 1];
    if (last && i.start.getTime() <= last.end.getTime()) {
      if (i.end > last.end) last.end = i.end;
    } else {
      out.push({ start: i.start, end: i.end });
    }
  }
  return out;
}

/**
 * Gaps in [from, to) between already-merged busy intervals, at least `minMinutes` long.
 * Pass busy through `mergeBusy` first when the source may overlap.
 *
 * @example
 * freeSlots(mergeBusy(busy, from, to), from, to, 30)
 */
export function freeSlots(busy: readonly Interval[], from: Date, to: Date, minMinutes: number): Interval[] {
  const minMs = minMinutes * MINUTE_MS;
  const out: Interval[] = [];
  let cursor = from;
  for (const b of busy) {
    if (b.start > cursor && b.start.getTime() - cursor.getTime() >= minMs) {
      out.push({ start: cursor, end: b.start });
    }
    if (b.end > cursor) cursor = b.end;
  }
  if (to > cursor && to.getTime() - cursor.getTime() >= minMs) {
    out.push({ start: cursor, end: to });
  }
  return out;
}
