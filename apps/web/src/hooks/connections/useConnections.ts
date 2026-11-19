// Connected calendars: the list with sync status, the holiday catalog, and subscribe / sync now /
// remove. Every change refetches the calendars and occurrences, since a connection brings its own.
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { homaClient, unwrap } from '@/api';
import { calendarKeys } from '@/hooks/calendar';
import {
  type Connection,
  ConnectionListSchema,
  ConnectionSchema,
  type HolidayFeed,
  HolidayFeedListSchema,
} from '@/schemas';

export const connectionKeys = { list: ['connections'] as const, holidays: ['holiday-calendars'] as const };

export type SubscribeVars = ({ url: string } | { holidayId: string }) & { name?: string; color?: string };

export type ConnectionMutations = {
  subscribe: UseMutationResult<Connection, Error, SubscribeVars>;
  syncNow: UseMutationResult<Connection, Error, string>;
  remove: UseMutationResult<void, Error, string>;
};

/** The user's connected calendars, oldest first. */
export const useConnections = (): UseQueryResult<Connection[]> =>
  useQuery({
    queryKey: connectionKeys.list,
    queryFn: async (): Promise<Connection[]> =>
      ConnectionListSchema.parse(await unwrap(homaClient.GET('/connections'))),
  });

/** Public-holiday feeds to pick from. */
export const useHolidayCalendars = (): UseQueryResult<HolidayFeed[]> =>
  useQuery({
    queryKey: connectionKeys.holidays,
    queryFn: async (): Promise<HolidayFeed[]> =>
      HolidayFeedListSchema.parse(await unwrap(homaClient.GET('/holiday-calendars'))),
    staleTime: Number.POSITIVE_INFINITY,
  });

/**
 * @example
 * const { subscribe } = useConnectionMutations();
 * subscribe.mutate({ url: 'webcal://example.com/holidays.ics' });
 */
export function useConnectionMutations(): ConnectionMutations {
  const qc = useQueryClient();
  const refresh = async (): Promise<void> => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: connectionKeys.list }),
      qc.invalidateQueries({ queryKey: calendarKeys.calendars }),
      qc.invalidateQueries({ queryKey: calendarKeys.occurrences }),
    ]);
  };
  const subscribe = useMutation({
    mutationFn: async (body: SubscribeVars): Promise<Connection> =>
      ConnectionSchema.parse(await unwrap(homaClient.POST('/connections/ics', { body }))),
    onSuccess: refresh,
  });
  const syncNow = useMutation({
    mutationFn: async (id: string): Promise<Connection> =>
      ConnectionSchema.parse(await unwrap(homaClient.POST('/connections/{id}/sync', { params: { path: { id } } }))),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await unwrap(homaClient.DELETE('/connections/{id}', { params: { path: { id } } }));
    },
    onSettled: refresh,
  });
  return { subscribe, syncNow, remove };
}
