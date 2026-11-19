// Dragging an event to another day in the month view.
import type { Occurrence } from '@/schemas';
import { addDays, daysBetween, parseIsoDate, type Span } from '@/services/dates';

/** The occurrence's times moved from day `from` to day `to` (YYYY-MM-DD), keeping the time of day. */
export function moveToDay(o: Occurrence, from: string, to: string): Span {
  const shift = daysBetween(parseIsoDate(from), parseIsoDate(to));
  return { start: addDays(new Date(o.start), shift), end: addDays(new Date(o.end), shift) };
}
