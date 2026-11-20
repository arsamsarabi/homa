import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Drawer,
  Group,
  Indicator,
  List,
  Loader,
  NativeSelect,
  Stack,
  Text,
} from '@mantine/core';
import { IconBell, IconCheck } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ChangeEvent, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { Notification } from '@/schemas';
import { SNOOZES, type Snooze } from '@/services/reminders';

export type NotificationBellProps = {
  unread: number;
  items: readonly Notification[];
  loading: boolean;
  error: string | undefined;
  onRetry: () => void;
  opened: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSnooze: (id: string, snooze: Snooze) => void;
  onDone: (id: string) => void;
  /** The notification's time, formatted for the user. */
  when: (n: Notification) => string;
};

/** The header bell with the unread count, and a drawer of open notifications with snooze and done. */
export function NotificationBell(p: NotificationBellProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <Indicator label={p.unread} size={16} disabled={p.unread === 0} offset={4}>
        <ActionIcon
          variant="subtle"
          size="lg"
          onClick={p.onOpen}
          aria-label={p.unread ? t('notifications.bellUnread', { count: p.unread }) : t('notifications.bell')}
        >
          <IconBell size={20} aria-hidden />
        </ActionIcon>
      </Indicator>
      <Drawer
        opened={p.opened}
        onClose={p.onClose}
        position="right"
        size="md"
        padding="lg"
        title={t('notifications.title')}
      >
        <Stack>
          {p.loading && <Loader size="sm" aria-label={t('common.loading')} />}
          {p.error && (
            <Alert color="red" role="alert">
              <Group justify="space-between">
                <Text size="sm">{t('notifications.loadFailed', { message: p.error })}</Text>
                <Button size="xs" variant="light" onClick={p.onRetry}>
                  {t('common.retry')}
                </Button>
              </Group>
            </Alert>
          )}
          {!p.loading && !p.error && p.items.length === 0 && (
            <Text c="dimmed" size="sm">
              {t('notifications.empty')}
            </Text>
          )}
          <List listStyleType="none" spacing="sm" aria-label={t('notifications.title')}>
            {p.items.map((n) => (
              <List.Item key={n.id}>
                <Stack gap={4}>
                  <Text fw={n.read ? 400 : 700}>{n.title || t('notifications.untitled')}</Text>
                  <Text size="xs" c="dimmed">
                    {p.when(n)}
                  </Text>
                  <Group gap="xs" wrap="nowrap">
                    <NativeSelect
                      size="xs"
                      aria-label={t('notifications.snoozeLabel', { title: n.title })}
                      value=""
                      data={[
                        { value: '', label: t('notifications.snooze'), disabled: true },
                        ...SNOOZES.map((s) => ({ value: s, label: t(`notifications.snoozeFor.${s}`) })),
                      ]}
                      onChange={(e: ChangeEvent<HTMLSelectElement>): void => {
                        if (e.currentTarget.value) p.onSnooze(n.id, e.currentTarget.value as Snooze);
                      }}
                    />
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconCheck size={14} aria-hidden />}
                      onClick={(): void => p.onDone(n.id)}
                      aria-label={t('notifications.doneLabel', { title: n.title })}
                    >
                      {t('notifications.done')}
                    </Button>
                  </Group>
                </Stack>
              </List.Item>
            ))}
          </List>
          <Anchor component={Link} to="/reminders" size="sm" onClick={p.onClose}>
            {t('notifications.manage')}
          </Anchor>
        </Stack>
      </Drawer>
    </>
  );
}
