// Reading a time range: cached occurrences plus on-the-fly expansion past the cache horizon.
import { type ResolvedOccurrence, resolveOccurrences } from '@homa/core';
import { type Db, repo } from '@homa/db';

export type OccurrenceView = ResolvedOccurrence<repo.EventRow>;

/** Every occurrence of the user's events overlapping [from, to), sorted by start. */
export async function listOccurrences(
  db: Db,
  userId: string,
  from: Date,
  to: Date,
  calendarIds?: readonly string[],
): Promise<OccurrenceView[]> {
  const cached = await repo.listCachedOccurrences(db, userId, from, to, calendarIds);
  const late = await repo.listEventsPastCache(db, userId, to, calendarIds);
  const ids = [...new Set([...cached.map((c) => c.eventId), ...late.map((e) => e.id)])];
  if (!ids.length) return [];
  const [events, overrides] = await Promise.all([repo.listEventsByIds(db, ids), repo.listOverrides(db, ids)]);
  return resolveOccurrences({ cached, late, events, overrides, from, to });
}
