// Calendar data: typed API client plus TanStack Query hooks. Every write refetches occurrences.
import { type components, createHomaClient } from '@homa/api-client';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Calendar = components['schemas']['Calendar'];
export type Occurrence = components['schemas']['Occurrence'];
export type HomaEvent = components['schemas']['Event'];
export type EventInput = components['schemas']['EventInput'];
export type EventPatch = components['schemas']['EventPatch'];
export type Scope = 'this' | 'following' | 'all';

export const client = createHomaClient('/api');

/** Unwraps an openapi-fetch result, throwing the API's error message. */
async function ok<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>) {
  const { data, error, response } = await p;
  if (error || !response.ok) throw new Error((error as { error?: string } | undefined)?.error ?? response.statusText);
  return data as T;
}

export const calendarsQuery = queryOptions({
  queryKey: ['calendars'],
  queryFn: () => ok(client.GET('/calendars')),
});

export const occurrencesQuery = (from: Date, to: Date) =>
  queryOptions({
    queryKey: ['occurrences', from.toISOString(), to.toISOString()],
    queryFn: () =>
      ok(client.GET('/occurrences', { params: { query: { from: from.toISOString(), to: to.toISOString() } } })),
    placeholderData: (prev) => prev,
  });

export const useCalendars = () => useQuery(calendarsQuery);
export const useOccurrences = (from: Date, to: Date) => useQuery(occurrencesQuery(from, to));

export const getEvent = (id: string) => ok(client.GET('/events/{id}', { params: { path: { id } } }));

export function useEventMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['occurrences'] });
  const create = useMutation({
    mutationFn: (body: EventInput) => ok(client.POST('/events', { body })),
    onSettled: refresh,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; patch: EventPatch; scope?: Scope; recurrenceId?: string }) =>
      ok(
        client.PATCH('/events/{id}', {
          params: { path: { id: v.id }, query: { scope: v.scope ?? 'all', recurrenceId: v.recurrenceId } },
          body: v.patch,
        }),
      ),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (v: { id: string; scope?: Scope; recurrenceId?: string }) =>
      ok(
        client.DELETE('/events/{id}', {
          params: { path: { id: v.id }, query: { scope: v.scope ?? 'all', recurrenceId: v.recurrenceId } },
        }),
      ),
    onSettled: refresh,
  });
  return { create, update, remove };
}
