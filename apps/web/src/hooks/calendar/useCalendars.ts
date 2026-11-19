import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { Calendar } from '@/schemas';
import { calendarsQuery } from './queries';

/** The user's calendars, oldest first. */
export const useCalendars = (): UseQueryResult<Calendar[]> => useQuery(calendarsQuery());
