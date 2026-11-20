// Renaming, recoloring, hiding and showing a calendar. The calendars list updates at once (the
// filter and colors respond without waiting) and rolls back if the server refuses.
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { homaClient, unwrap } from '@/api';
import { type Calendar, CalendarSchema } from '@/schemas';
import { calendarKeys } from './queries';

export type CalendarPatchVars = { id: string; name?: string; color?: string; hidden?: boolean };
/** The calendars list before the optimistic change, to roll back to. */
type Snapshot = { before: Calendar[] | undefined };

export function useCalendarUpdate(): UseMutationResult<Calendar, Error, CalendarPatchVars, Snapshot> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: CalendarPatchVars): Promise<Calendar> =>
      CalendarSchema.parse(await unwrap(homaClient.PATCH('/calendars/{id}', { params: { path: { id } }, body }))),
    onMutate: async ({ id, ...patch }: CalendarPatchVars): Promise<Snapshot> => {
      await qc.cancelQueries({ queryKey: calendarKeys.calendars });
      const before = qc.getQueryData<Calendar[]>(calendarKeys.calendars);
      qc.setQueryData<Calendar[]>(calendarKeys.calendars, (list) =>
        list?.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
      return { before };
    },
    onError: (_e: Error, _v: CalendarPatchVars, snapshot: Snapshot | undefined): void => {
      qc.setQueryData(calendarKeys.calendars, snapshot?.before);
    },
    onSettled: async (): Promise<void> => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: calendarKeys.calendars }),
        // Connections list their calendars too ('connections' is connectionKeys.list, which imports this module).
        qc.invalidateQueries({ queryKey: ['connections'] }),
      ]);
    },
  });
}
