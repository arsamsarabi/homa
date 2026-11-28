// Creating, changing and deleting events. Writes update the occurrences cache at once and roll back
// if the server refuses; a settle always refetches to match the server.
import { type QueryKey, type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { type EventInput, type EventPatch, homaClient, unwrap } from '@/api';
import { EventSchema, type HomaEvent, type Occurrence, type Scope } from '@/schemas';
import { tempOccurrence, withoutRemoved, withPatched, withRealId } from '@/services/optimistic';
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

/**
 * Real ids for creates still in flight, by temp id. A drag or delete can start on an event before
 * its create returns; the request waits for the real id instead of sending the temp one.
 */
const pendingIds = new Map<string, { promise: Promise<string>; resolve: (id: string) => void; reject: () => void }>();
const realId = async (id: string): Promise<string> => (await pendingIds.get(id)?.promise) ?? id;

type OccSnapshot = { entries: [QueryKey, Occurrence[] | undefined][]; tempId?: string };

export function useEventMutations(): EventMutations {
  const qc = useQueryClient();
  const refresh = async (): Promise<void> => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: calendarKeys.occurrences }),
      qc.invalidateQueries({ queryKey: ['event'] }),
    ]);
  };

  const snapshot = async (): Promise<OccSnapshot> => {
    await qc.cancelQueries({ queryKey: calendarKeys.occurrences });
    return { entries: qc.getQueriesData<Occurrence[]>({ queryKey: calendarKeys.occurrences }) };
  };

  const restore = (snap: OccSnapshot | undefined): void => {
    for (const [key, data] of snap?.entries ?? []) qc.setQueryData(key, data);
  };

  const patchLists = (fn: (list: Occurrence[]) => Occurrence[]): void => {
    qc.setQueriesData<Occurrence[]>({ queryKey: calendarKeys.occurrences }, (list) => (list ? fn(list) : list));
  };

  const create = useMutation({
    mutationFn: async (body: EventInput): Promise<HomaEvent> =>
      EventSchema.parse(await unwrap(homaClient.POST('/events', { body }))),
    onMutate: async (body: EventInput): Promise<OccSnapshot> => {
      const snap = await snapshot();
      const tempId = `temp-${crypto.randomUUID()}`;
      let resolve: (id: string) => void = () => {};
      let reject: () => void = () => {};
      const promise = new Promise<string>((res, rej) => {
        resolve = res;
        reject = (): void => rej(new Error('The event was not created'));
      });
      promise.catch(() => {}); // only a waiting update or delete cares
      pendingIds.set(tempId, { promise, resolve, reject });
      patchLists((list) => [...list, tempOccurrence(body, tempId)]);
      return { ...snap, tempId };
    },
    onSuccess: (event: HomaEvent, _body: EventInput, snap: OccSnapshot | undefined): void => {
      const tempId = snap?.tempId;
      if (!tempId) return;
      patchLists((list) => withRealId(list, tempId, event.id));
      pendingIds.get(tempId)?.resolve(event.id);
      pendingIds.delete(tempId);
    },
    onError: (_e: Error, _v: EventInput, snap: OccSnapshot | undefined): void => {
      restore(snap);
      if (!snap?.tempId) return;
      pendingIds.get(snap.tempId)?.reject();
      pendingIds.delete(snap.tempId);
    },
    onSettled: refresh,
  });

  const update = useMutation({
    mutationFn: async (v: UpdateVars): Promise<HomaEvent> =>
      EventSchema.parse(
        await unwrap(
          homaClient.PATCH('/events/{id}', {
            params: { path: { id: await realId(v.id) }, query: { scope: v.scope, recurrenceId: v.recurrenceId } },
            body: v.patch,
          }),
        ),
      ),
    onMutate: async (v: UpdateVars): Promise<OccSnapshot> => {
      const snap = await snapshot();
      patchLists((list) => withPatched(list, v.id, v.patch, v.scope, v.recurrenceId));
      return snap;
    },
    onError: (_e: Error, _v: UpdateVars, snap: OccSnapshot | undefined): void => restore(snap),
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: async (v: RemoveVars): Promise<void> => {
      await unwrap(
        homaClient.DELETE('/events/{id}', {
          params: { path: { id: await realId(v.id) }, query: { scope: v.scope, recurrenceId: v.recurrenceId } },
        }),
      );
    },
    onMutate: async (v: RemoveVars): Promise<OccSnapshot> => {
      const snap = await snapshot();
      patchLists((list) => withoutRemoved(list, v.id, v.scope, v.recurrenceId));
      return snap;
    },
    onError: (_e: Error, _v: RemoveVars, snap: OccSnapshot | undefined): void => restore(snap),
    onSettled: refresh,
  });

  const fetchSeries = (id: string): Promise<HomaEvent> => qc.fetchQuery(eventQuery(id));
  return { create, update, remove, fetchSeries };
}
