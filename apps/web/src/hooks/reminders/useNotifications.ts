// The bell: open notifications, polled every 30 seconds and on focus (and refreshed when a push
// arrives), with mark-read, snooze and done.
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { homaClient, unwrap } from '@/api';
import { type Notification, type NotificationList, NotificationListSchema, NotificationSchema } from '@/schemas';

export const notificationKeys = { list: ['notifications'] as const };
const POLL_MS = 30_000;

/**
 * Open notifications and the unread count.
 * @example const { data } = useNotifications(); data?.unread
 */
export function useNotifications(): UseQueryResult<NotificationList> {
  const qc = useQueryClient();
  useEffect(() => {
    // The service worker tells open pages when a push arrives (public/push-sw.js).
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const onMessage = (e: MessageEvent): void => {
      if ((e.data as { type?: string } | null)?.type === 'homa-notification')
        void qc.invalidateQueries({ queryKey: notificationKeys.list });
    };
    sw.addEventListener('message', onMessage);
    return () => sw.removeEventListener('message', onMessage);
  }, [qc]);
  return useQuery({
    queryKey: notificationKeys.list,
    queryFn: async (): Promise<NotificationList> =>
      NotificationListSchema.parse(await unwrap(homaClient.GET('/notifications'))),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
}

export type SnoozeVars = { id: string; until: Date };

export type NotificationActions = {
  readAll: UseMutationResult<void, Error, void>;
  snooze: UseMutationResult<Notification, Error, SnoozeVars>;
  done: UseMutationResult<Notification, Error, string>;
};

export function useNotificationActions(): NotificationActions {
  const qc = useQueryClient();
  const refresh = (): Promise<void> => qc.invalidateQueries({ queryKey: notificationKeys.list });
  return {
    readAll: useMutation({
      mutationFn: async (): Promise<void> => {
        await unwrap(homaClient.POST('/notifications/read'));
      },
      onSettled: refresh,
    }),
    snooze: useMutation({
      mutationFn: async (v: SnoozeVars): Promise<Notification> =>
        NotificationSchema.parse(
          await unwrap(
            homaClient.POST('/notifications/{id}/snooze', {
              params: { path: { id: v.id } },
              body: { until: v.until.toISOString() },
            }),
          ),
        ),
      onSettled: refresh,
    }),
    done: useMutation({
      mutationFn: async (id: string): Promise<Notification> =>
        NotificationSchema.parse(
          await unwrap(homaClient.POST('/notifications/{id}/done', { params: { path: { id } } })),
        ),
      onSettled: refresh,
    }),
  };
}
