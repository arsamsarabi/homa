// Pure helpers to patch the occurrences cache for optimistic event writes.
import type { EventInput, EventPatch } from '@/api';
import type { Occurrence, Scope } from '@/schemas';

/** Drop occurrences that a delete with this scope removes. */
export function withoutRemoved(
  list: readonly Occurrence[],
  eventId: string,
  scope: Scope,
  recurrenceId: string | undefined,
): Occurrence[] {
  if (scope === 'all' || !recurrenceId) return list.filter((o) => o.eventId !== eventId);
  if (scope === 'this') return list.filter((o) => !(o.eventId === eventId && o.recurrenceId === recurrenceId));
  // following: this recurrence and later ones in the series.
  return list.filter((o) => !(o.eventId === eventId && o.recurrenceId >= recurrenceId));
}

/** Apply a patch to matching occurrences (all, one, or this and following). */
export function withPatched(
  list: readonly Occurrence[],
  eventId: string,
  patch: EventPatch,
  scope: Scope,
  recurrenceId: string | undefined,
): Occurrence[] {
  return list.map((o) => {
    if (o.eventId !== eventId) return o;
    if (scope === 'this' && recurrenceId && o.recurrenceId !== recurrenceId) return o;
    if (scope === 'following' && recurrenceId && o.recurrenceId < recurrenceId) return o;
    return {
      ...o,
      ...(patch.calendarId !== undefined && { calendarId: patch.calendarId }),
      ...(patch.summary !== undefined && { summary: patch.summary }),
      ...(patch.description !== undefined && { description: patch.description }),
      ...(patch.location !== undefined && { location: patch.location }),
      ...(patch.start !== undefined && { start: patch.start }),
      ...(patch.end !== undefined && { end: patch.end }),
      ...(patch.allDay !== undefined && { allDay: patch.allDay }),
      ...(patch.tz !== undefined && { tz: patch.tz }),
      ...(patch.rrule !== undefined && { recurring: Boolean(patch.rrule) }),
    };
  });
}

/** A temporary occurrence for a create that has not returned an id yet. */
export function tempOccurrence(body: EventInput, tempId: string): Occurrence {
  return {
    eventId: tempId,
    calendarId: body.calendarId,
    recurrenceId: body.start,
    start: body.start,
    end: body.end,
    summary: body.summary,
    description: body.description ?? null,
    location: body.location ?? null,
    allDay: body.allDay,
    tz: body.tz,
    recurring: Boolean(body.rrule),
    overridden: false,
    taskId: null,
    taskDone: false,
  };
}

/** Swap a temp create for the real event id after the server responds. */
export function withRealId(list: readonly Occurrence[], tempId: string, realId: string): Occurrence[] {
  return list.map((o) => (o.eventId === tempId ? { ...o, eventId: realId } : o));
}
