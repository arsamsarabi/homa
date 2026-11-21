// Notification channels (email, ntfy, Gotify, webhooks): the list, changes and "send test".
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { type ChannelInput, type ChannelPatch, homaClient, unwrap } from '@/api';
import {
  type Channel,
  type ChannelList,
  ChannelListSchema,
  ChannelSchema,
  type ChannelTest,
  ChannelTestSchema,
} from '@/schemas';

export const channelKeys = { list: ['notification-channels'] as const };

export const useChannels = (): UseQueryResult<ChannelList> =>
  useQuery({
    queryKey: channelKeys.list,
    queryFn: async (): Promise<ChannelList> =>
      ChannelListSchema.parse(await unwrap(homaClient.GET('/notification-channels'))),
  });

export type ChannelMutations = {
  create: UseMutationResult<Channel, Error, ChannelInput>;
  update: UseMutationResult<Channel, Error, ChannelPatch & { id: string }>;
  remove: UseMutationResult<void, Error, string>;
  test: UseMutationResult<ChannelTest, Error, string>;
};

export function useChannelMutations(): ChannelMutations {
  const qc = useQueryClient();
  const refresh = (): Promise<void> => qc.invalidateQueries({ queryKey: channelKeys.list });
  return {
    create: useMutation({
      mutationFn: async (body: ChannelInput): Promise<Channel> =>
        ChannelSchema.parse(await unwrap(homaClient.POST('/notification-channels', { body }))),
      onSettled: refresh,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: ChannelPatch & { id: string }): Promise<Channel> =>
        ChannelSchema.parse(
          await unwrap(homaClient.PATCH('/notification-channels/{id}', { params: { path: { id } }, body })),
        ),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string): Promise<void> => {
        await unwrap(homaClient.DELETE('/notification-channels/{id}', { params: { path: { id } } }));
      },
      onSettled: refresh,
    }),
    test: useMutation({
      mutationFn: async (id: string): Promise<ChannelTest> =>
        ChannelTestSchema.parse(
          await unwrap(homaClient.POST('/notification-channels/{id}/test', { params: { path: { id } } })),
        ),
      onSettled: refresh,
    }),
  };
}
