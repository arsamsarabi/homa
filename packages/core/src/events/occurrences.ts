// Occurrences of stored events: overrides applied, the cache horizon, and merging the cached
// instances with ones expanded on the fly past it. Pure: the caller loads the rows.
import { ValidationError } from '../errors';
import { expand, type Occurrence, type Series } from '../recurrence';

const DAY_MS = 86_400_000;

/** How far ahead the instance cache holds recurring events. Reads past it expand on the fly. */
export const HORIZON_DAYS = 548; // about 18 months

/** The fields of a stored event that recurrence needs. */
export type StoredSeries = {
  startAt: Date;
  endAt: Date;
  tz: string;
  rrule: string | null;
  exdates: Date[];
  rdates?: Date[];
};

/** The fields of a stored override that move an occurrence. */
export type OverrideTimes = { recurrenceId: Date; startAt: Date; endAt: Date };

export const shift = (d: Date, ms: number): Date => new Date(d.getTime() + ms);

/** The end of the cached window for a recurring event, counted from `now`. */
export const horizonFrom = (now: Date): Date => shift(now, HORIZON_DAYS * DAY_MS);

/** Recurring events whose cache ends before this need re-expanding (a month of slack). */
export const extendBefore = (now: Date): Date => shift(horizonFrom(now), -30 * DAY_MS);

export const seriesOf = (e: StoredSeries): Series => ({
  start: e.startAt,
  end: e.endAt,
  tz: e.tz,
  rrule: e.rrule,
  exdates: e.exdates,
  rdates: e.rdates ?? [],
});

/**
 * Occurrences of an event overlapping [from, to) with overrides applied. A moved occurrence
 * keeps its recurrence id.
 */
export function occurrencesWithOverrides(
  e: StoredSeries,
  overrides: readonly OverrideTimes[],
  from: Date,
  to: Date,
): Occurrence[] {
  const byId = new Map(overrides.map((o) => [o.recurrenceId.getTime(), o]));
  // An override can move an occurrence into the range from outside it, so widen the search.
  const span = Math.max(0, ...overrides.map((o) => Math.abs(o.startAt.getTime() - o.recurrenceId.getTime())));
  return expand(seriesOf(e), shift(from, -span), shift(to, span))
    .map((occ): Occurrence => {
      const o = byId.get(occ.recurrenceId.getTime());
      return o ? { recurrenceId: occ.recurrenceId, start: o.startAt, end: o.endAt } : occ;
    })
    .filter((occ) => occ.start < to && occ.end > from);
}

/** Throws unless `recurrenceId` is one of the event's occurrences (cancelled ones don't count). */
export function assertOccurrence(e: StoredSeries, recurrenceId: Date): void {
  const hit = expand(seriesOf(e), recurrenceId, shift(recurrenceId, 1)).some(
    (o) => o.recurrenceId.getTime() === recurrenceId.getTime(),
  );
  if (!hit) throw new ValidationError('No occurrence at recurrenceId');
}

/** A cached instance row: one occurrence of one event. */
export type CachedInstance = { eventId: string; recurrenceId: Date; start: Date; end: Date };

/** An override with the details it changes. */
export type StoredOverride = OverrideTimes & {
  eventId: string;
  summary: string | null;
  description: string | null;
  location: string | null;
};

/** An event as the occurrence list needs it. */
export type StoredEvent = StoredSeries & {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  expandedUntil: Date | null;
};

export type ResolvedOccurrence<E extends StoredEvent> = {
  event: E;
  recurrenceId: Date;
  start: Date;
  end: Date;
  summary: string;
  description: string | null;
  location: string | null;
  overridden: boolean;
};

const key = (eventId: string, recurrenceId: Date): string => `${eventId}|${recurrenceId.getTime()}`;

/**
 * Every occurrence overlapping [from, to), sorted by start: the cached instances plus, for
 * `late` events (recurring ones whose cache stops before `to`), occurrences past their cache.
 * `events` and `overrides` must cover every event in `cached` and `late`.
 */
export function resolveOccurrences<E extends StoredEvent>(args: {
  cached: readonly CachedInstance[];
  late: readonly E[];
  events: readonly E[];
  overrides: readonly StoredOverride[];
  from: Date;
  to: Date;
}): ResolvedOccurrence<E>[] {
  const byEvent = new Map(args.events.map((e) => [e.id, e]));
  const overrideBy = new Map(args.overrides.map((o) => [key(o.eventId, o.recurrenceId), o]));

  const found = new Map<string, CachedInstance>();
  for (const c of args.cached) found.set(key(c.eventId, c.recurrenceId), c);
  for (const e of args.late) {
    const own = args.overrides.filter((o) => o.eventId === e.id);
    // The cache already has every occurrence whose original start is before expanded_until.
    const after = e.expandedUntil ?? args.from;
    for (const o of occurrencesWithOverrides(e, own, args.from, args.to)) {
      if (o.recurrenceId >= after) found.set(key(e.id, o.recurrenceId), { eventId: e.id, ...o });
    }
  }

  const out: ResolvedOccurrence<E>[] = [];
  for (const f of found.values()) {
    const event = byEvent.get(f.eventId);
    if (!event) continue; // deleted between the two reads
    const o = overrideBy.get(key(f.eventId, f.recurrenceId));
    out.push({
      event,
      recurrenceId: f.recurrenceId,
      start: f.start,
      end: f.end,
      summary: o?.summary ?? event.summary,
      description: o?.description ?? event.description,
      location: o?.location ?? event.location,
      overridden: Boolean(o),
    });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}
