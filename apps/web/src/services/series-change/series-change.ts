// Changing a recurring event from one of its occurrences: which scopes make sense, and how a
// dragged occurrence's new time applies to the whole series.
import type { EventPatch } from '@/api';
import type { Occurrence, Scope } from '@/schemas';

/** Calendar, all-day and repeat changes can't apply to one occurrence alone. */
export const allowedScopes = (seriesChanged: boolean): Scope[] =>
  seriesChanged ? ['following', 'all'] : ['this', 'following', 'all'];

/** True when a change to the whole series must be re-based on the series' own start. */
export const shiftsSeries = (o: Occurrence, scope: Scope, patch: EventPatch): boolean =>
  scope === 'all' && o.recurring && Boolean(patch.start || patch.end);

/**
 * The patch for the whole series when occurrence `o` moved: the same shift applied to the
 * series' start (`seriesStart`), keeping the length the occurrence now has.
 */
export function seriesPatch(o: Occurrence, patch: EventPatch, seriesStart: string): EventPatch {
  const start = new Date(patch.start ?? o.start).getTime();
  const shift = start - new Date(o.start).getTime();
  const length = new Date(patch.end ?? o.end).getTime() - start;
  const newStart = new Date(new Date(seriesStart).getTime() + shift);
  return { ...patch, start: newStart.toISOString(), end: new Date(newStart.getTime() + length).toISOString() };
}
