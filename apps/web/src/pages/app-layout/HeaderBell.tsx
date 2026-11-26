import { useDisclosure } from '@mantine/hooks';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { NotificationBell } from '@/components';
import { useNotificationActions, useNotifications } from '@/hooks/reminders';
import { useHomeZone } from '@/hooks/settings';
import type { Notification } from '@/schemas';
import { formatWhen, type Snooze, snoozeUntil } from '@/services/reminders';
import { useAnnouncer } from '@/stores';

/** The bell wired to the notifications: opening it marks them read. */
export function HeaderBell(): JSX.Element {
  const { t, i18n } = useTranslation();
  const tz = useHomeZone();
  const list = useNotifications();
  const actions = useNotificationActions();
  const announce = useAnnouncer((s) => s.announce);
  const [opened, drawer] = useDisclosure(false);
  const fail = (err: unknown): void =>
    announce(t('notifications.actionFailed', { message: String(err) }), { kind: 'error' });

  return (
    <NotificationBell
      unread={list.data?.unread ?? 0}
      items={list.data?.items ?? []}
      loading={list.isPending}
      error={list.error?.message}
      onRetry={(): void => void list.refetch()}
      opened={opened}
      onOpen={(): void => {
        drawer.open();
        if (list.data?.unread) actions.readAll.mutate();
      }}
      onClose={drawer.close}
      onSnooze={(id: string, s: Snooze): void => {
        actions.snooze
          .mutateAsync({ id, until: snoozeUntil(s, new Date(), tz) })
          .then(() => announce(t('notifications.snoozed')))
          .catch(fail);
      }}
      onDone={(id: string): void => {
        actions.done
          .mutateAsync(id)
          .then(() => announce(t('notifications.markedDone')))
          .catch(fail);
      }}
      when={(n: Notification): string => formatWhen(new Date(n.start), n.allDay, i18n.language, tz)}
    />
  );
}
