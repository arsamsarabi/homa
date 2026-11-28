import { useDisclosure } from '@mantine/hooks';
import { useNavigate } from '@tanstack/react-router';
import { type JSX, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NotificationBell } from '@/components';
import { useNotificationActions, useNotificationArrivals, useNotifications } from '@/hooks/reminders';
import { useHomeZone } from '@/hooks/settings';
import { notifyInfo } from '@/lib/notify';
import type { Notification } from '@/schemas';
import { today } from '@/services/dates';
import {
  capitalize,
  formatWhen,
  notificationTarget,
  relativeTime,
  type Snooze,
  snoozeUntil,
  splitNew,
} from '@/services/reminders';
import { useAnnouncer } from '@/stores';

/**
 * The bell wired to the notifications. Opening it marks them read, but the ones that were unread
 * keep their "new" dot until it closes. A reminder that fires while Homa is open also shows a toast.
 */
export function HeaderBell(): JSX.Element {
  const { t, i18n } = useTranslation();
  const tz = useHomeZone();
  const list = useNotifications();
  const actions = useNotificationActions();
  const announce = useAnnouncer((s) => s.announce);
  const navigate = useNavigate();
  const [opened, panel] = useDisclosure(false);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());
  const items = list.data?.items;
  const groups = useMemo(() => splitNew(items ?? [], newIds), [items, newIds]);
  const fail = (err: unknown): void =>
    announce(t('notifications.actionFailed', { message: String(err) }), { kind: 'error' });

  const when = (n: Notification): string => {
    const at = new Date(n.start);
    const relative = relativeTime(at, new Date(), n.allDay, today(tz), i18n.language);
    const line = t(`notifications.when.${n.kind}`, { relative, time: formatWhen(at, n.allDay, i18n.language, tz) });
    return capitalize(line, i18n.language);
  };

  useNotificationArrivals(items, (n: Notification): void => {
    if (opened) return; // it's in front of them already
    const title = n.title || t('notifications.untitled');
    notifyInfo(when(n), { id: `notification-${n.id}`, title, autoClose: 6000 });
    announce(t('notifications.arrived', { title, when: when(n) }), { toast: false });
  });

  const open = (): void => {
    setNewIds(new Set((items ?? []).filter((n) => !n.read).map((n) => n.id)));
    panel.open();
    if (list.data?.unread) actions.readAll.mutate();
  };
  const close = (): void => {
    panel.close();
    setNewIds(new Set());
  };

  return (
    <NotificationBell
      unread={list.data?.unread ?? 0}
      fresh={groups.fresh}
      earlier={groups.earlier}
      loading={list.isPending}
      error={list.error?.message}
      onRetry={(): void => void list.refetch()}
      opened={opened}
      onOpen={open}
      onClose={close}
      onOpenItem={(n: Notification): void => {
        close();
        void navigate(notificationTarget(n, tz));
      }}
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
      onClearAll={(): void => {
        actions.clearAll
          .mutateAsync()
          .then(() => announce(t('notifications.cleared')))
          .catch(fail);
      }}
      clearing={actions.clearAll.isPending}
      when={when}
    />
  );
}
