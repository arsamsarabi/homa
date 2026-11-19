import { ActionIcon, Alert, Badge, Button, CloseButton, ColorSwatch, Group, Paper, Stack, Text } from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { Calendar, Connection } from '@/schemas';
import classes from './ConnectedCalendarsSection.module.css';

export type ConnectionItemProps = {
  connection: Connection;
  /** Formats the last sync time. */
  formatTime: (iso: string) => string;
  syncing: boolean;
  onSync: () => void;
  onRemove: () => void;
  onEditCalendar: (calendar: Calendar) => void;
  /** CalDAV: choose which of the account's calendars sync. */
  onChoose: () => void;
  onDismissNotice: () => void;
};

const STATUS_COLOR = { pending: 'gray', syncing: 'blue', ok: 'green', error: 'red' } as const;

/** The name a connection is listed by: the account for CalDAV, the calendar for a feed. */
export const connectionName = (c: Connection, untitled: string): string =>
  (c.provider === 'caldav' ? c.label : c.calendars[0]?.name) ?? untitled;

/**
 * One connection: its name, sync status, last check, last error and notice, its calendars (each
 * can be renamed and recolored), and actions.
 */
export function ConnectionItem({
  connection: c,
  formatTime,
  syncing,
  onSync,
  onRemove,
  onEditCalendar,
  onChoose,
  onDismissNotice,
}: ConnectionItemProps): JSX.Element {
  const { t } = useTranslation();
  const name = connectionName(c, t('connections.untitled'));
  const caldav = c.provider === 'caldav';
  return (
    <Paper withBorder p="sm" radius="md" component="li" aria-label={name}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            {!caldav && <ColorSwatch color={c.calendars[0]?.color ?? 'gray'} size={12} aria-hidden />}
            <Text fw={600}>{name}</Text>
            <Badge size="sm" variant="light" color={STATUS_COLOR[c.status]}>
              {t(`connections.status.${c.status}`)}
            </Badge>
          </Group>
          <Group gap="xs" wrap="nowrap">
            {caldav && (
              <Button size="xs" variant="default" onClick={onChoose}>
                {t('caldav.choose')}
              </Button>
            )}
            <Button size="xs" variant="default" onClick={onSync} loading={syncing}>
              {t('connections.syncNow')}
            </Button>
            <Button size="xs" variant="subtle" color="red" onClick={onRemove}>
              {t('connections.remove')}
            </Button>
          </Group>
        </Group>
        <Text size="xs" c="dimmed">
          {caldav ? t('caldav.twoWay') : t('connections.readOnly')} ·{' '}
          {c.lastSyncedAt ? t('connections.lastChecked', { time: formatTime(c.lastSyncedAt) }) : t('connections.never')}
        </Text>
        {c.status === 'error' && c.lastError && (
          <Alert color="red" p="xs">
            <Text size="xs">{t('connections.lastError', { message: c.lastError })}</Text>
          </Alert>
        )}
        {c.notice && (
          <Alert color="yellow" p="xs">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Text size="xs">{c.notice}</Text>
              <CloseButton size="sm" onClick={onDismissNotice} aria-label={t('connections.dismissNotice')} />
            </Group>
          </Alert>
        )}
        {caldav && c.calendars.length === 0 && (
          <Text size="xs" c="dimmed">
            {t('caldav.noneChosen')}
          </Text>
        )}
        <Stack component="ul" gap={4} className={classes.list} aria-label={t('connections.calendarsOf', { name })}>
          {c.calendars.map((cal) => (
            <Group component="li" key={cal.id} gap="xs" wrap="nowrap">
              <ColorSwatch color={cal.color} size={10} aria-hidden />
              <Text size="sm">{cal.name}</Text>
              {caldav && cal.readOnly && (
                <Text span size="xs" c="dimmed">
                  {t('connections.readOnly')}
                </Text>
              )}
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={() => onEditCalendar(cal)}
                aria-label={t('connections.editCalendar', { name: cal.name })}
              >
                <IconPencil size={14} aria-hidden />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}
