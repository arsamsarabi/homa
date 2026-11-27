import { Alert, Button, Group, Loader, Modal, Stack, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type JSX, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { CaldavDrawer, SubscribeDrawer } from '@/pages/settings/connections';
import { AddCalendarDrawer } from './AddCalendarDrawer';
import { CalendarEditDrawer } from './CalendarEditDrawer';
import classes from './CalendarsTab.module.css';
import { CalendarsTabProvider, useCalendarsTabModel } from './CalendarsTabProvider';
import { ConnectionCard, connectionName, isAccount } from './ConnectionCard';
import { HomaCalendarsCard } from './HomaCalendarsCard';
import { SharedCalendarsCard } from './SharedCalendarsCard';

/**
 * Settings → Calendars: every calendar you see, as cards. Homa's own first, then one per connected
 * account or link, then one per person sharing with you. One "Add calendar" button starts every
 * kind of connection.
 */
export function CalendarsTab(): JSX.Element {
  return (
    <CalendarsTabProvider>
      <CalendarsTabBody />
    </CalendarsTabProvider>
  );
}

function CalendarsTabBody(): JSX.Element {
  const { t } = useTranslation();
  const headingId = useId();
  const tab = useCalendarsTabModel();
  const { calendars, connections, removing, removingCalendar } = tab;
  const failed = calendars.isError ? calendars : connections.isError ? connections : undefined;
  return (
    <Stack component="section" aria-labelledby={headingId}>
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap={4} maw={560}>
          <Title order={2} size="h3" id={headingId}>
            {t('calendars.title')}
          </Title>
          <Text size="sm" c="dimmed">
            {t('calendars.hint')}
          </Text>
        </Stack>
        <Button leftSection={<IconPlus size={16} aria-hidden />} onClick={tab.picker.open}>
          {t('calendars.add')}
        </Button>
      </Group>
      {tab.oauth.errorKey && (
        <Alert color="red" role="alert" withCloseButton onClose={tab.oauth.clearError}>
          {t(tab.oauth.errorKey)}
        </Alert>
      )}
      {(calendars.isPending || connections.isPending) && <Loader size="sm" aria-label={t('calendars.loading')} />}
      {failed && (
        <QueryErrorAlert title={t('calendars.loadFailed')} error={failed.error} onRetry={() => void failed.refetch()} />
      )}
      {calendars.data && connections.data && (
        <Stack component="ul" gap="md" className={classes.list}>
          <HomaCalendarsCard />
          {connections.data.map((c) => (
            <ConnectionCard key={c.id} connection={c} />
          ))}
          {tab.shared.map((g) => (
            <SharedCalendarsCard key={g.ownerId} group={g} />
          ))}
        </Stack>
      )}
      <AddCalendarDrawer />
      <SubscribeDrawer mode={tab.subscribing.mode} onClose={tab.subscribing.close} />
      <CaldavDrawer
        opened={tab.caldav.state !== undefined}
        connectionId={tab.caldav.state?.connectionId}
        preset={tab.caldav.state?.preset}
        onClose={tab.caldav.close}
      />
      <CalendarEditDrawer calendar={tab.editing.calendar} onClose={tab.editing.close} />
      <Modal opened={removing.connection !== undefined} onClose={removing.close} title={t('connections.removeTitle')}>
        <Stack>
          <Text size="sm">
            {t(removing.connection && isAccount(removing.connection) ? 'caldav.removeBody' : 'connections.removeBody', {
              name: removing.connection ? connectionName(removing.connection, t('connections.untitled')) : '',
            })}
          </Text>
          {removing.error && (
            <Alert color="red" role="alert">
              {removing.error}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={removing.close}>
              {t('common.cancel')}
            </Button>
            <Button color="red" onClick={removing.confirm} loading={removing.busy}>
              {t('connections.remove')}
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={removingCalendar.calendar !== undefined}
        onClose={removingCalendar.close}
        title={t('connections.removeTitle')}
      >
        <Stack>
          <Text size="sm">{t('connections.removeMissingBody', { name: removingCalendar.calendar?.name ?? '' })}</Text>
          {removingCalendar.error && (
            <Alert color="red" role="alert">
              {removingCalendar.error}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={removingCalendar.close}>
              {t('common.cancel')}
            </Button>
            <Button color="red" onClick={removingCalendar.confirm} loading={removingCalendar.busy}>
              {t('connections.removeFromHoma')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
