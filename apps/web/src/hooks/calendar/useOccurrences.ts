import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Occurrence } from '@/schemas';
import { occurrencesQuery } from './queries';

const NONE: ReadonlySet<string> = new Set();

/** Every occurrence overlapping [from, to), sorted by start, leaving out the `hidden` calendars. */
export function useOccurrences(from: Date, to: Date, hidden: ReadonlySet<string> = NONE): UseQueryResult<Occurrence[]> {
  const select = useCallback(
    (list: Occurrence[]): Occurrence[] => (hidden.size ? list.filter((o) => !hidden.has(o.calendarId)) : list),
    [hidden],
  );
  return useQuery({ ...occurrencesQuery(from, to), select });
}
