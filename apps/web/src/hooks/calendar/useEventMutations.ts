// Creating, changing and deleting events. Every write refetches occurrences and the changed series.
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { type EventInput, type EventPatch, homaClient, unwrap } from '@/api';
import { EventSchema, type HomaEvent, type Scope } from '@/schemas';
import { calendarKeys, eventQuery } from './queries';

export type UpdateVars = { id: string; patch: EventPatch; scope: Scope; recurrenceId?: string };
export type RemoveVars = { id: string; scope: Scope; recurrenceId?: string };

export type EventMutations = {
  create: UseMutationResult<HomaEvent, Error, EventInput>;
  update: UseMutationResult<HomaEvent, Error, UpdateVars>;
  remove: UseMutationResult<void, Error, RemoveVars>;
  /** The series behind an occurrence, from the cache or the API. */
  fetchSeries: (id: string) => Promise<HomaEvent>;
};

export function useEventMutations(): EventMutations {
  const qc = useQueryClient();
  const refresh = async (): Promise<void> => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: calendarKeys.occurrences }),
      qc.invalidateQueries({ queryKey: ['event'] }),
    ]);
  };
  const create = useMutation({
    mutationFn: async (body: EventInput): Promise<HomaEvent> =>
      EventSchema.parse(await unwrap(homaClient.POST('/events', { body }))),
    onSettled: refresh,
  });
  const update = useMutation({
    mutationFn: async (v: UpdateVars): Promise<HomaEvent> =>
      EventSchema.parse(
        await unwrap(
          homaClient.PATCH('/events/{id}', {
            params: { path: { id: v.id }, query: { scope: v.scope, recurrenceId: v.recurrenceId } },
            body: v.patch,
          }),
        ),
      ),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async (v: RemoveVars): Promise<void> => {
      await unwrap(
        homaClient.DELETE('/events/{id}', {
          params: { path: { id: v.id }, query: { scope: v.scope, recurrenceId: v.recurrenceId } },
        }),
      );
    },
    onSettled: refresh,
  });
  const fetchSeries = (id: string): Promise<HomaEvent> => qc.fetchQuery(eventQuery(id));
  return { create, update, remove, fetchSeries };
}
