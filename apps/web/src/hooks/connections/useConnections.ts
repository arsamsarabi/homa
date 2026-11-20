// Connected calendars: the list with sync status, the holiday catalog, CalDAV accounts and their
// calendars, and subscribe / connect / choose / sync now / remove (a connection, or one calendar gone at the source). Every change refetches
// the calendars and occurrences, since a connection brings its own.
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
  type RemoteCalendar,
  RemoteCalendarListSchema,
} from '@/schemas';

export const connectionKeys = {
  list: ['connections'] as const,
  holidays: ['holiday-calendars'] as const,
  remote: (id: string): readonly string[] => ['connections', id, 'remote-calendars'],
};

export type SubscribeVars = ({ url: string } | { holidayId: string }) & { name?: string; color?: string };

export type CaldavVars = { serverUrl: string; username: string; password: string };
export type ChooseVars = { id: string; remoteIds: string[] };

export type ConnectionMutations = {
  subscribe: UseMutationResult<Connection, Error, SubscribeVars>;
  addCaldav: UseMutationResult<Connection, Error, CaldavVars>;
  choose: UseMutationResult<Connection, Error, ChooseVars>;
  syncNow: UseMutationResult<Connection, Error, string>;
  dismissNotice: UseMutationResult<void, Error, string>;
  remove: UseMutationResult<void, Error, string>;
  /** Deletes one calendar of a connection (only one gone at the source; the server refuses others). */
  removeCalendar: UseMutationResult<void, Error, string>;
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

/** The calendars on a CalDAV account (asks the server each time); off while `id` is undefined. */
export const useRemoteCalendars = (id: string | undefined): UseQueryResult<RemoteCalendar[]> =>
  useQuery({
    queryKey: connectionKeys.remote(id ?? ''),
    queryFn: async (): Promise<RemoteCalendar[]> =>
      RemoteCalendarListSchema.parse(
        await unwrap(homaClient.GET('/connections/{id}/remote-calendars', { params: { path: { id: id ?? '' } } })),
      ),
    enabled: id !== undefined,
    staleTime: 0,
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
  const addCaldav = useMutation({
    mutationFn: async (body: CaldavVars): Promise<Connection> =>
      ConnectionSchema.parse(await unwrap(homaClient.POST('/connections/caldav', { body }))),
    onSuccess: refresh,
  });
  const choose = useMutation({
    mutationFn: async ({ id, remoteIds }: ChooseVars): Promise<Connection> =>
      ConnectionSchema.parse(
        await unwrap(homaClient.PUT('/connections/{id}/calendars', { params: { path: { id } }, body: { remoteIds } })),
      ),
    onSettled: refresh,
  });
  const dismissNotice = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await unwrap(homaClient.DELETE('/connections/{id}/notice', { params: { path: { id } } }));
    },
    onSettled: refresh,
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
  const removeCalendar = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await unwrap(homaClient.DELETE('/calendars/{id}', { params: { path: { id } } }));
    },
    onSettled: refresh,
  });
  return { subscribe, addCaldav, choose, syncNow, dismissNotice, remove, removeCalendar };
}
