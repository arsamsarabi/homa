// Polls: lists, one poll, its prefill, holds, and the mutations that change them.
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
  type Hold,
  HoldSchema,
  type Poll,
  PollSchema,
  type PollSummary,
  PollSummaryListSchema,
  type Suggestion,
  SuggestionSchema,
} from '@/schemas';

export type PollView = 'mine' | 'answer' | 'past';

export const pollKeys = {
  all: ['polls'] as const,
  list: (view: PollView) => ['polls', 'list', view] as const,
  one: (id: string) => ['polls', 'one', id] as const,
  prefill: (id: string) => ['polls', 'prefill', id] as const,
  holds: (from: string, to: string) => ['holds', from, to] as const,
};

export const usePolls = (view: PollView): UseQueryResult<PollSummary[]> =>
  useQuery({
    queryKey: pollKeys.list(view),
    queryFn: async (): Promise<PollSummary[]> =>
      PollSummaryListSchema.parse(await unwrap(homaClient.GET('/polls', { params: { query: { view } } }))),
  });

export const usePoll = (id: string | undefined): UseQueryResult<Poll> =>
  useQuery({
    queryKey: pollKeys.one(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<Poll> =>
      PollSchema.parse(await unwrap(homaClient.GET('/polls/{id}', { params: { path: { id: id ?? '' } } }))),
  });

/** The times that clash with your calendars, where your answer starts them. */
export const usePollPrefill = (id: string, enabled: boolean): UseQueryResult<string[]> =>
  useQuery({
    queryKey: pollKeys.prefill(id),
    enabled,
    queryFn: async (): Promise<string[]> =>
      (await unwrap(homaClient.GET('/polls/{id}/prefill', { params: { path: { id } } }))).cannot,
  });

/** Your tentative holds from open polls in [from, to). */
export const useHolds = (from: Date, to: Date): UseQueryResult<Hold[]> =>
  useQuery({
    queryKey: pollKeys.holds(from.toISOString(), to.toISOString()),
    queryFn: async (): Promise<Hold[]> =>
      HoldSchema.array().parse(
        await unwrap(
          homaClient.GET('/holds', { params: { query: { from: from.toISOString(), to: to.toISOString() } } }),
        ),
      ),
  });

export type PollFields = {
  title: string;
  description: string | null;
  location: string | null;
  durationMinutes: number;
  tz: string;
  slots: string[];
  people: { userId: string; required: boolean }[];
  deadline: string | null;
  quorum: number | null;
  holds: boolean;
  calendarId: string | null;
};

export type SuggestFields = {
  from: string;
  to: string;
  durationMinutes: number;
  tz: string;
  people: { userId: string; required: boolean }[];
  days: 'any' | 'weekdays' | 'weekends';
  between: { from: string; to: string } | null;
};

export type PollMutations = {
  create: UseMutationResult<Poll, Error, PollFields>;
  update: UseMutationResult<Poll, Error, Partial<PollFields> & { id: string }>;
  remove: UseMutationResult<void, Error, string>;
  open: UseMutationResult<Poll, Error, string>;
  close: UseMutationResult<Poll, Error, string>;
  reopen: UseMutationResult<Poll, Error, { id: string; deadline: string | null }>;
  finalize: UseMutationResult<Poll, Error, { id: string; slotId: string; calendarId: string }>;
  answer: UseMutationResult<Poll, Error, { id: string; ranked: string[]; cannot: string[]; holds: boolean }>;
  suggest: UseMutationResult<Suggestion[], Error, SuggestFields>;
};

export function usePollMutations(): PollMutations {
  const qc = useQueryClient();
  const put = (p: Poll): void => {
    qc.setQueryData(pollKeys.one(p.id), p);
    void qc.invalidateQueries({ queryKey: ['polls', 'list'] });
    void qc.invalidateQueries({ queryKey: ['holds'] });
  };
  const path = (id: string): { params: { path: { id: string } } } => ({ params: { path: { id } } });
  return {
    create: useMutation({
      mutationFn: async (body: PollFields): Promise<Poll> =>
        PollSchema.parse(await unwrap(homaClient.POST('/polls', { body }))),
      onSuccess: put,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: Partial<PollFields> & { id: string }): Promise<Poll> =>
        PollSchema.parse(await unwrap(homaClient.PATCH('/polls/{id}', { ...path(id), body }))),
      onSuccess: put,
    }),
    remove: useMutation({
      mutationFn: async (id: string): Promise<void> => {
        await unwrap(homaClient.DELETE('/polls/{id}', path(id)));
      },
      onSettled: (): Promise<void> => qc.invalidateQueries({ queryKey: pollKeys.all }),
    }),
    open: useMutation({
      mutationFn: async (id: string): Promise<Poll> =>
        PollSchema.parse(await unwrap(homaClient.POST('/polls/{id}/open', path(id)))),
      onSuccess: put,
    }),
    close: useMutation({
      mutationFn: async (id: string): Promise<Poll> =>
        PollSchema.parse(await unwrap(homaClient.POST('/polls/{id}/close', path(id)))),
      onSuccess: put,
    }),
    reopen: useMutation({
      mutationFn: async ({ id, deadline }: { id: string; deadline: string | null }): Promise<Poll> =>
        PollSchema.parse(await unwrap(homaClient.POST('/polls/{id}/reopen', { ...path(id), body: { deadline } }))),
      onSuccess: put,
    }),
    finalize: useMutation({
      mutationFn: async ({ id, ...body }: { id: string; slotId: string; calendarId: string }): Promise<Poll> =>
        PollSchema.parse(await unwrap(homaClient.POST('/polls/{id}/finalize', { ...path(id), body }))),
      onSuccess: (p: Poll): void => {
        put(p);
        void qc.invalidateQueries({ queryKey: calendarKeys.occurrences });
      },
    }),
    answer: useMutation({
      mutationFn: async ({
        id,
        ...body
      }: {
        id: string;
        ranked: string[];
        cannot: string[];
        holds: boolean;
      }): Promise<Poll> => PollSchema.parse(await unwrap(homaClient.PUT('/polls/{id}/answers', { ...path(id), body }))),
      onSuccess: put,
    }),
    suggest: useMutation({
      mutationFn: async (body: SuggestFields): Promise<Suggestion[]> =>
        SuggestionSchema.array().parse(await unwrap(homaClient.POST('/polls/suggest', { body }))),
    }),
  };
}
