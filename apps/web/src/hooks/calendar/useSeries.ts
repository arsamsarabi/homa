import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import type { HomaEvent } from '@/schemas';
import { eventQuery } from './queries';

/** The series behind a recurring occurrence; idle when `eventId` is undefined. */
export const useSeries = (eventId: string | undefined): UseQueryResult<HomaEvent> =>
  useQuery({ ...eventQuery(eventId ?? ''), enabled: eventId !== undefined });
