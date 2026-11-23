// People on the instance, invites and circles: queries and their mutations.
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { homaClient, unwrap } from '@/api';
import {
  type Circle,
  CircleListSchema,
  CircleSchema,
  type CreatedInvite,
  CreatedInviteSchema,
  type Invite,
  InviteListSchema,
  type InviteLookup,
  InviteLookupSchema,
  type Person,
  PersonListSchema,
} from '@/schemas';

export const peopleKeys = {
  people: ['people'] as const,
  invites: ['invites'] as const,
  circles: ['circles'] as const,
  lookup: (token: string) => ['invite-lookup', token] as const,
};

export const usePeople = (): UseQueryResult<Person[]> =>
  useQuery({
    queryKey: peopleKeys.people,
    queryFn: async (): Promise<Person[]> => PersonListSchema.parse(await unwrap(homaClient.GET('/people'))),
  });

export const useInvites = (enabled = true): UseQueryResult<Invite[]> =>
  useQuery({
    queryKey: peopleKeys.invites,
    queryFn: async (): Promise<Invite[]> => InviteListSchema.parse(await unwrap(homaClient.GET('/invites'))),
    enabled,
  });

/** Who an invite link is from; an error (404) means the link can't be used. */
export const useInviteLookup = (token: string | undefined): UseQueryResult<InviteLookup> =>
  useQuery({
    queryKey: peopleKeys.lookup(token ?? ''),
    queryFn: async (): Promise<InviteLookup> =>
      InviteLookupSchema.parse(
        await unwrap(homaClient.GET('/invite-lookup', { params: { query: { token: token ?? '' } } })),
      ),
    enabled: Boolean(token),
    retry: false,
  });

export type InviteMutations = {
  create: UseMutationResult<CreatedInvite, Error, { email?: string }>;
  revoke: UseMutationResult<void, Error, string>;
};

export function useInviteMutations(): InviteMutations {
  const qc = useQueryClient();
  const refresh = (): Promise<void> => qc.invalidateQueries({ queryKey: peopleKeys.invites });
  return {
    create: useMutation({
      mutationFn: async (body: { email?: string }): Promise<CreatedInvite> =>
        CreatedInviteSchema.parse(await unwrap(homaClient.POST('/invites', { body }))),
      onSettled: refresh,
    }),
    revoke: useMutation({
      mutationFn: async (id: string): Promise<void> => {
        await unwrap(homaClient.DELETE('/invites/{id}', { params: { path: { id } } }));
      },
      onSettled: refresh,
    }),
  };
}

export const useCircles = (): UseQueryResult<Circle[]> =>
  useQuery({
    queryKey: peopleKeys.circles,
    queryFn: async (): Promise<Circle[]> => CircleListSchema.parse(await unwrap(homaClient.GET('/circles'))),
  });

export type CircleDraftInput = { name: string; memberIds: string[] };
export type CircleMutations = {
  create: UseMutationResult<Circle, Error, CircleDraftInput>;
  /** Renames (when the name changed) and sets the members. */
  update: UseMutationResult<Circle, Error, CircleDraftInput & { id: string; renamed: boolean }>;
  remove: UseMutationResult<void, Error, string>;
};

export function useCircleMutations(): CircleMutations {
  const qc = useQueryClient();
  const refresh = (): Promise<void> => qc.invalidateQueries({ queryKey: peopleKeys.circles });
  return {
    create: useMutation({
      mutationFn: async (body: CircleDraftInput): Promise<Circle> =>
        CircleSchema.parse(await unwrap(homaClient.POST('/circles', { body }))),
      onSettled: refresh,
    }),
    update: useMutation({
      mutationFn: async ({
        id,
        name,
        memberIds,
        renamed,
      }: CircleDraftInput & { id: string; renamed: boolean }): Promise<Circle> => {
        const path = { params: { path: { id } } };
        if (renamed) await unwrap(homaClient.PATCH('/circles/{id}', { ...path, body: { name } }));
        return CircleSchema.parse(
          await unwrap(homaClient.PUT('/circles/{id}/members', { ...path, body: { memberIds } })),
        );
      },
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string): Promise<void> => {
        await unwrap(homaClient.DELETE('/circles/{id}', { params: { path: { id } } }));
      },
      onSettled: refresh,
    }),
  };
}
