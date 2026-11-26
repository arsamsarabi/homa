// Owner-only grant set for a calendar: who can see it, and the per-calendar default.
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { homaClient, unwrap } from '@/api';
import { type CalendarGrants, CalendarGrantsSchema } from '@/schemas';
import { calendarKeys } from './queries';

export const grantsKey = (id: string): readonly ['calendar-grants', string] => ['calendar-grants', id] as const;

export const useCalendarGrants = (id: string | undefined): UseQueryResult<CalendarGrants> =>
  useQuery({
    queryKey: grantsKey(id ?? ''),
    queryFn: async (): Promise<CalendarGrants> =>
      CalendarGrantsSchema.parse(
        await unwrap(homaClient.GET('/calendars/{id}/grants', { params: { path: { id: id ?? '' } } })),
      ),
    enabled: Boolean(id),
  });

export function usePutCalendarGrants(): UseMutationResult<CalendarGrants, Error, { id: string; body: CalendarGrants }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: CalendarGrants }): Promise<CalendarGrants> =>
      CalendarGrantsSchema.parse(
        await unwrap(homaClient.PUT('/calendars/{id}/grants', { params: { path: { id } }, body })),
      ),
    onSuccess: (data: CalendarGrants, { id }: { id: string; body: CalendarGrants }): void => {
      qc.setQueryData(grantsKey(id), data);
      void qc.invalidateQueries({ queryKey: calendarKeys.calendars });
    },
  });
}
