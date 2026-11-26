// Reading a time range: cached occurrences plus on-the-fly expansion past the cache horizon.
// Includes calendars shared at freebusy+; freebusy rows are stripped in the response mapper.
import { type AccessLevel, type ResolvedOccurrence, resolveOccurrences } from '@homa/core';
import { type Db, repo } from '@homa/db';
import { accessibleCalendars } from './access';

/** An occurrence, and the task it is a time block for, if any. */
export type OccurrenceView = ResolvedOccurrence<repo.EventRow> & {
  task?: { id: string; done: boolean };
  /** Effective access on this occurrence's calendar for the viewer. */
  access: Exclude<AccessLevel, 'none'>;
};

/** Every accessible occurrence overlapping [from, to), sorted by start. */
export async function listOccurrences(
  db: Db,
  userId: string,
  from: Date,
  to: Date,
  calendarIds?: readonly string[],
): Promise<OccurrenceView[]> {
  const access = await accessibleCalendars(db, userId, calendarIds);
  const ids = access.map((a) => a.calendar.id);
  if (!ids.length) return [];
  const byAccess = new Map(access.map((a) => [a.calendar.id, a.access]));

  const cached = await repo.listCachedOccurrencesForCalendars(db, ids, from, to);
  const late = await repo.listEventsPastCacheForCalendars(db, ids, to);
  const eventIds = [...new Set([...cached.map((c) => c.eventId), ...late.map((e) => e.id)])];
  if (!eventIds.length) return [];
  const [events, overrides, blocks] = await Promise.all([
    repo.listEventsByIds(db, eventIds),
    repo.listOverrides(db, eventIds),
    repo.tasksByBlock(db, eventIds),
  ]);
  return resolveOccurrences({ cached, late, events, overrides, from, to }).map((o) => {
    const level = byAccess.get(o.event.calendarId) ?? 'none';
    if (level === 'none') {
      // Shouldn't happen: we only queried accessible calendars.
      return { ...o, access: 'freebusy' as const, task: undefined };
    }
    // Task blocks are owner-only (path rules table).
    const task = level === 'owner' ? blocks.get(o.event.id) : undefined;
    return { ...o, access: level, task };
  });
}
