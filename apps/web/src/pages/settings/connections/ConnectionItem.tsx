import { Alert, Badge, Button, ColorSwatch, Group, Paper, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { Connection } from '@/schemas';

export type ConnectionItemProps = {
  connection: Connection;
  /** Formats the last sync time. */
  formatTime: (iso: string) => string;
  syncing: boolean;
  onSync: () => void;
  onRemove: () => void;
};

const STATUS_COLOR = { pending: 'gray', syncing: 'blue', ok: 'green', error: 'red' } as const;

/** One connected calendar: its name and color, sync status, last check, last error, and actions. */
export function ConnectionItem({
  connection: c,
  formatTime,
  syncing,
  onSync,
  onRemove,
}: ConnectionItemProps): JSX.Element {
  const { t } = useTranslation();
  const calendar = c.calendars[0];
  const name = calendar?.name ?? t('connections.untitled');
  return (
    <Paper withBorder p="sm" radius="md" component="li" aria-label={name}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <ColorSwatch color={calendar?.color ?? 'gray'} size={12} aria-hidden />
            <Text fw={600}>{name}</Text>
            <Badge size="sm" variant="light" color={STATUS_COLOR[c.status]}>
              {t(`connections.status.${c.status}`)}
            </Badge>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Button size="xs" variant="default" onClick={onSync} loading={syncing}>
              {t('connections.syncNow')}
            </Button>
            <Button size="xs" variant="subtle" color="red" onClick={onRemove}>
              {t('connections.remove')}
            </Button>
          </Group>
        </Group>
        <Text size="xs" c="dimmed">
          {t('connections.readOnly')} ·{' '}
          {c.lastSyncedAt ? t('connections.lastChecked', { time: formatTime(c.lastSyncedAt) }) : t('connections.never')}
        </Text>
        {c.status === 'error' && c.lastError && (
          <Alert color="red" p="xs">
            <Text size="xs">{t('connections.lastError', { message: c.lastError })}</Text>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
