// Dragging an event to another day in the month view.
import type { Occurrence } from '@/schemas';
import { addDays, daysBetween, parseIsoDate, type Span, wallSpan } from '@/services/dates';
import { instantOf } from '@/services/zones';

/** The occurrence moved from day `from` to day `to` (YYYY-MM-DD) in zone `tz`, keeping its time of day. */
export function moveToDay(o: Occurrence, from: string, to: string, tz: string): Span {
  const epoch = new Date(0);
  const shift = daysBetween(parseIsoDate(from, epoch), parseIsoDate(to, epoch));
  if (o.allDay) return { start: addDays(new Date(o.start), shift), end: addDays(new Date(o.end), shift) };
  const start = instantOf(addDays(wallSpan(o, tz).start, shift), tz);
  return { start, end: new Date(start.getTime() + new Date(o.end).getTime() - new Date(o.start).getTime()) };
}
