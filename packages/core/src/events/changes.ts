// What a change or delete to a stored event does, decided without touching the database.
// Recurring events take a scope: one occurrence (an override), this and following (the series is
// split in two), or the whole series. The caller applies the plan inside one transaction.
import { ValidationError } from '../errors';
import { continueFrom, endBefore } from '../recurrence';
import { assertOccurrence, type OverrideTimes, type StoredSeries, seriesOf, shift } from './occurrences';

export type Scope = 'this' | 'following' | 'all';

/** The writable fields of an event, as the API takes them. */
export type EventFields = {
  calendarId: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  tz: string;
  rrule: string | null;
  /** Minutes of travel before a timed event; null for none. */
  travelMinutes?: number | null;
};

/** The longest travel time an event can have: a day. */
export const MAX_TRAVEL_MINUTES = 1440;

export type EventPatch = Partial<EventFields>;

export type ChangePlan =
  /** Change the event itself; recurring ones move their exceptions with them by `shiftMs`. */
  | { kind: 'series'; start: Date; end: Date; exdates: Date[]; rdates: Date[]; shiftMs: number; durationMs: number }
  /** Write an override for one occurrence (see `overrideValues`). */
  | { kind: 'occurrence'; recurrenceId: Date }
  /**
   * End the series before `recurrenceId` (`previousRrule`, `previousExdates`, `previousRdates`) and start a new one
   * there; overrides from `recurrenceId` on move to the new series, shifted by `shiftMs`.
   */
  | {
      kind: 'split';
      recurrenceId: Date;
      start: Date;
      end: Date;
      rrule: string | null;
      exdates: Date[];
      rdates: Date[];
      shiftMs: number;
      durationMs: number;
      previousRrule: string;
      previousExdates: Date[];
      previousRdates: Date[];
    };

const wholeSeries = (e: StoredSeries, scope: Scope, recurrenceId: Date | undefined): boolean =>
  !e.rrule || scope === 'all' || (scope === 'following' && recurrenceId?.getTime() === e.startAt.getTime());

function requireOccurrence(e: StoredSeries, recurrenceId: Date | undefined): Date {
  if (!recurrenceId) throw new ValidationError('recurrenceId is required for this scope');
  assertOccurrence(e, recurrenceId);
  return recurrenceId;
}

/** Decides how `patch` applies to event `e` for `scope`. Throws ValidationError for impossible changes. */
export function planChange(e: StoredSeries, patch: EventPatch, scope: Scope, recurrenceId?: Date): ChangePlan {
  const duration = e.endAt.getTime() - e.startAt.getTime();
  const start = patch.start ?? e.startAt;
  const end = patch.end ?? (patch.start ? shift(patch.start, duration) : e.endAt);
  if (end <= start) throw new ValidationError('end must be after start');

  if (wholeSeries(e, scope, recurrenceId)) {
    const shiftMs = start.getTime() - e.startAt.getTime();
    return {
      kind: 'series',
      start,
      end,
      exdates: e.exdates.map((d) => shift(d, shiftMs)),
      rdates: (e.rdates ?? []).map((d) => shift(d, shiftMs)),
      shiftMs,
      durationMs: end.getTime() - start.getTime(),
    };
  }

  const at = requireOccurrence(e, recurrenceId);
  if (scope === 'this') {
    if (
      patch.calendarId ||
      patch.rrule !== undefined ||
      patch.allDay !== undefined ||
      patch.tz ||
      patch.travelMinutes !== undefined
    )
      throw new ValidationError('Only the title, details and times of one occurrence can change');
    return { kind: 'occurrence', recurrenceId: at };
  }

  const rrule = e.rrule as string; // wholeSeries() is false, so the event recurs
  const newStart = patch.start ?? at;
  const newEnd = patch.end ?? shift(newStart, patch.start ? duration : end.getTime() - start.getTime());
  const shiftMs = newStart.getTime() - at.getTime();
  return {
    kind: 'split',
    recurrenceId: at,
    start: newStart,
    end: newEnd,
    rrule: patch.rrule !== undefined ? patch.rrule : continueFrom({ ...seriesOf(e), rrule }, at),
    exdates: e.exdates.filter((d) => d >= at).map((d) => shift(d, shiftMs)),
    rdates: (e.rdates ?? []).filter((d) => d >= at).map((d) => shift(d, shiftMs)),
    shiftMs,
    durationMs: newEnd.getTime() - newStart.getTime(),
    previousRrule: endBefore(rrule, at),
    previousExdates: e.exdates.filter((d) => d < at),
    previousRdates: (e.rdates ?? []).filter((d) => d < at),
  };
}

export type OverrideDetails = { summary: string | null; description: string | null; location: string | null };
export type OverrideValues = OverrideDetails & { startAt: Date; endAt: Date };

/** The override row for one changed occurrence, merging `patch` over an existing override. */
export function overrideValues(
  e: StoredSeries,
  existing: (OverrideTimes & OverrideDetails) | undefined,
  patch: EventPatch,
  recurrenceId: Date,
): OverrideValues {
  const duration = e.endAt.getTime() - e.startAt.getTime();
  const startAt = patch.start ?? existing?.startAt ?? recurrenceId;
  const endAt =
    patch.end ?? (patch.start ? shift(patch.start, duration) : (existing?.endAt ?? shift(recurrenceId, duration)));
  if (endAt <= startAt) throw new ValidationError('end must be after start');
  return {
    summary: patch.summary ?? existing?.summary ?? null,
    description: patch.description !== undefined ? patch.description : (existing?.description ?? null),
    location: patch.location !== undefined ? patch.location : (existing?.location ?? null),
    startAt,
    endAt,
  };
}

export type DeletePlan =
  | { kind: 'event' }
  /** Cancel one occurrence: add it to the exdates and drop its override. */
  | { kind: 'occurrence'; recurrenceId: Date; exdates: Date[] }
  /** End the series before `recurrenceId` and drop the overrides from there on. */
  | { kind: 'following'; recurrenceId: Date; rrule: string; exdates: Date[]; rdates: Date[] };

/** Decides what deleting event `e` for `scope` removes. */
export function planDelete(e: StoredSeries, scope: Scope, recurrenceId?: Date): DeletePlan {
  if (wholeSeries(e, scope, recurrenceId)) return { kind: 'event' };
  const at = requireOccurrence(e, recurrenceId);
  if (scope === 'this') return { kind: 'occurrence', recurrenceId: at, exdates: [...e.exdates, at] };
  return {
    kind: 'following',
    recurrenceId: at,
    rrule: endBefore(e.rrule as string, at),
    exdates: e.exdates.filter((d) => d < at),
    rdates: (e.rdates ?? []).filter((d) => d < at),
  };
}
