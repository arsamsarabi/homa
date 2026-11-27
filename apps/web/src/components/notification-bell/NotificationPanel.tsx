import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconBellCheck, IconSettings } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { Notification } from '@/schemas';
import type { Snooze } from '@/services/reminders';
import classes from './NotificationBell.module.css';
import { NotificationItem } from './NotificationItem';

export type NotificationPanelProps = {
  /** The heading's id, which names the dialog the panel sits in. */
  headingId: string;
  /** New when the panel opened (they keep their dot until it closes), newest first. */
  fresh: readonly Notification[];
  earlier: readonly Notification[];
  loading: boolean;
  error: string | undefined;
  onRetry: () => void;
  onClose: () => void;
  onOpenItem: (n: Notification) => void;
  onSnooze: (id: string, snooze: Snooze) => void;
  onDone: (id: string) => void;
  onClearAll: () => void;
  clearing: boolean;
  /** "Starts in 10 minutes · 09:00": how far off and when, for the user. */
  when: (n: Notification) => string;
};

/** The notifications: New and Earlier, each with open, snooze and done; Clear all; an empty state. */
export function NotificationPanel(p: NotificationPanelProps): JSX.Element {
  const { t } = useTranslation();
  const count = p.fresh.length + p.earlier.length;
  const group = (heading: string, items: readonly Notification[], isNew: boolean): JSX.Element | null =>
    items.length === 0 ? null : (
      <section aria-label={heading}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="md" pt="xs" pb={4} aria-hidden>
          {heading}
        </Text>
        <ul className={classes.list}>
          {items.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              isNew={isNew}
              when={p.when(n)}
              onOpen={(): void => p.onOpenItem(n)}
              onSnooze={(s: Snooze): void => p.onSnooze(n.id, s)}
              onDone={(): void => p.onDone(n.id)}
            />
          ))}
        </ul>
      </section>
    );

  return (
    <Stack gap={0}>
      <Group justify="space-between" px="md" py="sm" className={classes.header}>
        <Title order={2} size="h5" id={p.headingId}>
          {t('notifications.title')}
        </Title>
        <Group gap={4}>
          {count > 0 && (
            <Button size="compact-sm" variant="subtle" onClick={p.onClearAll} loading={p.clearing}>
              {t('notifications.clearAll')}
            </Button>
          )}
          <Tooltip label={t('notifications.settings')}>
            <ActionIcon
              renderRoot={(props: Record<string, unknown>): JSX.Element => (
                <Link {...props} to="/settings" search={{ tab: 'notifications' }} />
              )}
              variant="subtle"
              color="gray"
              onClick={p.onClose}
              aria-label={t('notifications.settings')}
            >
              <IconSettings size={18} aria-hidden />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <ScrollArea.Autosize mah="min(70vh, 32rem)" type="auto">
        {p.loading && (
          <Group justify="center" p="lg">
            <Loader size="sm" aria-label={t('common.loading')} />
          </Group>
        )}
        {p.error && (
          <Alert color="red" role="alert" m="md">
            <Group justify="space-between">
              <Text size="sm">{t('notifications.loadFailed', { message: p.error })}</Text>
              <Button size="xs" variant="light" onClick={p.onRetry}>
                {t('common.retry')}
              </Button>
            </Group>
          </Alert>
        )}
        {!p.loading && !p.error && count === 0 && (
          <Stack align="center" gap="xs" px="lg" py="xl" ta="center">
            <ThemeIcon size={44} radius="xl" variant="light" aria-hidden>
              <IconBellCheck size={24} />
            </ThemeIcon>
            <Text fw={600}>{t('notifications.emptyTitle')}</Text>
            <Text size="sm" c="dimmed">
              {t('notifications.emptyHint')}
            </Text>
          </Stack>
        )}
        {group(t('notifications.new'), p.fresh, true)}
        {group(t('notifications.earlier'), p.earlier, false)}
      </ScrollArea.Autosize>
      <Group px="md" py="sm" className={classes.footer}>
        <Anchor component={Link} to="/reminders" size="sm" onClick={p.onClose}>
          {t('notifications.manage')}
        </Anchor>
      </Group>
    </Stack>
  );
}
