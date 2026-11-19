import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { Occurrence } from '@/schemas';
import { occurrencesQuery } from './queries';

/** Every occurrence overlapping [from, to), sorted by start. */
export const useOccurrences = (from: Date, to: Date): UseQueryResult<Occurrence[]> =>
  useQuery(occurrencesQuery(from, to));
