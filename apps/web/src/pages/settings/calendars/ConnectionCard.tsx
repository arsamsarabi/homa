import { ActionIcon, Alert, Badge, Button, CloseButton, Group, Menu, Text } from '@mantine/core';
import { IconDots, IconListCheck, IconRefresh, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { providerName } from '@/pages/settings/connections';
import type { Connection } from '@/schemas';
import { CalendarCard } from './CalendarCard';
import { CalendarRow } from './CalendarRow';
import { useCalendarsTabModel } from './CalendarsTabProvider';

const STATUS_COLOR = { pending: 'gray', syncing: 'blue', ok: 'green', error: 'red' } as const;

/** Accounts (CalDAV, Google, Microsoft) hold calendars to choose and sync both ways; feeds are one read-only calendar. */
export const isAccount = (c: Connection): boolean => c.provider !== 'ics';

/** The name a connection is listed by: the account, or the calendar for a feed. */
export const connectionName = (c: Connection, untitled: string): string =>
  (isAccount(c) ? c.label : c.calendars[0]?.name) ?? untitled;

/**
 * One connection: its name, sync status and last check, its errors and notice beside it, its
 * calendars, and a menu to choose calendars, sync now or remove it.
 */
export function ConnectionCard({ connection: c }: { connection: Connection }): JSX.Element {
  const { t } = useTranslation();
  const tab = useCalendarsTabModel();
  const name = connectionName(c, t('connections.untitled'));
  const account = isAccount(c);
  const calendars = tab.calendarsOf(c);
  const error = tab.errorFor(c.id) ?? tab.updateErrorFor(calendars.map((cal) => cal.id));
  const syncing = tab.syncingId === c.id;
  return (
    <CalendarCard
      title={name}
      listLabel={t('connections.calendarsOf', { name })}
      badges={
        <>
          {(c.provider === 'google' || c.provider === 'microsoft') && (
            <Text span size="xs" c="dimmed">
              {t(`${c.provider}.provider`)}
            </Text>
          )}
          <Badge size="sm" variant="light" color={STATUS_COLOR[c.status]}>
            {t(syncing ? 'connections.status.syncing' : `connections.status.${c.status}`)}
          </Badge>
        </>
      }
      subtitle={`${account ? t('caldav.twoWay') : t('connections.readOnly')} · ${
        c.lastSyncedAt ? t('connections.lastChecked', { time: tab.formatTime(c.lastSyncedAt) }) : t('connections.never')
      }`}
      actions={
        <Menu position="bottom-end" withinPortal={false}>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label={t('calendars.actions', { name })}>
              <IconDots size={18} aria-hidden />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {account && (
              <Menu.Item
                leftSection={<IconListCheck size={14} aria-hidden />}
                onClick={(): void => tab.caldav.choose(c.id)}
              >
                {t('caldav.choose')}
              </Menu.Item>
            )}
            <Menu.Item
              leftSection={<IconRefresh size={14} aria-hidden />}
              onClick={(): void => tab.sync(c.id)}
              disabled={syncing}
            >
              {t('connections.syncNow')}
            </Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} aria-hidden />}
              onClick={(): void => tab.removing.open(c)}
            >
              {t('connections.remove')}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      }
      notes={
        <>
          {error && (
            <Alert color="red" role="alert" p="xs">
              <Text size="xs">{error}</Text>
            </Alert>
          )}
          {c.status === 'error' && c.lastError && (
            <Alert color="red" p="xs">
              <Text size="xs">{t('connections.lastError', { message: c.lastError })}</Text>
            </Alert>
          )}
          {c.notice && (
            <Alert color="yellow" p="xs">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Text size="xs">{c.notice}</Text>
                <CloseButton
                  size="sm"
                  onClick={(): void => tab.dismissNotice(c.id)}
                  aria-label={t('connections.dismissNotice')}
                />
              </Group>
            </Alert>
          )}
          {calendars
            .filter((cal) => cal.remoteMissing)
            .map((cal) => (
              <Alert key={cal.id} color="yellow" p="xs">
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs">
                    {t('connections.missing', { name: cal.name, provider: providerName(c.provider, t) })}
                  </Text>
                  <Button size="xs" variant="default" color="red" onClick={(): void => tab.removingCalendar.open(cal)}>
                    {t('connections.removeFromHoma')}
                  </Button>
                </Group>
              </Alert>
            ))}
          {account && calendars.length === 0 && (
            <Text size="xs" c="dimmed">
              {t('caldav.noneChosen')}
            </Text>
          )}
        </>
      }
    >
      {calendars.map((cal) => (
        <CalendarRow
          key={cal.id}
          calendar={cal}
          note={account && cal.readOnly ? t('connections.readOnly') : undefined}
          editable
        />
      ))}
    </CalendarCard>
  );
}
