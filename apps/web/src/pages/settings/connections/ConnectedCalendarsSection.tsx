import { Alert, Button, Group, Loader, Modal, Stack, Text, Title } from '@mantine/core';
import { type JSX, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { useConnectionMutations, useConnections } from '@/hooks/connections';
import type { Calendar, Connection } from '@/schemas';
import { useAnnouncer } from '@/stores';
import { CaldavDrawer } from './CaldavDrawer';
import { CalendarEditDrawer } from './CalendarEditDrawer';
import classes from './ConnectedCalendarsSection.module.css';
import { ConnectionItem, connectionName } from './ConnectionItem';
import { SubscribeDrawer } from './SubscribeDrawer';

/** Settings section: connected calendars (ICS feeds, public holidays, CalDAV accounts) with their sync status. */
export function ConnectedCalendarsSection(): JSX.Element {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const connections = useConnections();
  const { syncNow, remove, dismissNotice } = useConnectionMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [adding, setAdding] = useState(false);
  // The CalDAV drawer: closed, adding an account (null) or choosing an account's calendars (its id).
  const [caldav, setCaldav] = useState<string | null>();
  const [editing, setEditing] = useState<Calendar>();
  const [removing, setRemoving] = useState<Connection>();
  const format = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language],
  );
  const formatTime = (iso: string): string => format.format(new Date(iso));

  const sync = (id: string): void =>
    syncNow.mutate(id, {
      onSuccess: (c: Connection) => announce(t(c.status === 'ok' ? 'connections.synced' : 'connections.syncFailed')),
    });
  const confirmRemove = (): void => {
    if (!removing) return;
    remove.mutate(removing.id, {
      onSuccess: () => announce(t('connections.removed')),
      onSettled: () => setRemoving(undefined),
    });
  };

  return (
    <Stack component="section" aria-labelledby={headingId} mt="xl">
      <Title order={2} size="h3" id={headingId}>
        {t('connections.title')}
      </Title>
      <Text size="sm" c="dimmed">
        {t('connections.hint')}
      </Text>
      <Group>
        <Button onClick={() => setAdding(true)}>{t('connections.add')}</Button>
        <Button variant="default" onClick={() => setCaldav(null)}>
          {t('caldav.add')}
        </Button>
      </Group>
      {connections.isPending && <Loader size="sm" aria-label={t('connections.loading')} />}
      {connections.isError && (
        <QueryErrorAlert
          title={t('connections.loadFailed')}
          error={connections.error}
          onRetry={() => void connections.refetch()}
        />
      )}
      {(syncNow.isError || remove.isError || dismissNotice.isError) && (
        <Alert color="red" role="alert">
          {(syncNow.error ?? remove.error ?? dismissNotice.error)?.message}
        </Alert>
      )}
      {connections.data?.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('connections.empty')}
        </Text>
      )}
      {connections.data && connections.data.length > 0 && (
        <Stack component="ul" gap="xs" className={classes.list}>
          {connections.data.map((c) => (
            <ConnectionItem
              key={c.id}
              connection={c}
              formatTime={formatTime}
              syncing={syncNow.isPending && syncNow.variables === c.id}
              onSync={() => sync(c.id)}
              onRemove={() => setRemoving(c)}
              onEditCalendar={setEditing}
              onChoose={() => setCaldav(c.id)}
              onDismissNotice={() => dismissNotice.mutate(c.id)}
            />
          ))}
        </Stack>
      )}
      <SubscribeDrawer opened={adding} onClose={() => setAdding(false)} />
      <CaldavDrawer
        opened={caldav !== undefined}
        connectionId={caldav ?? undefined}
        onClose={() => setCaldav(undefined)}
      />
      <CalendarEditDrawer calendar={editing} onClose={() => setEditing(undefined)} />
      <Modal
        opened={removing !== undefined}
        onClose={() => setRemoving(undefined)}
        title={t('connections.removeTitle')}
      >
        <Stack>
          <Text size="sm">
            {t(removing?.provider === 'caldav' ? 'caldav.removeBody' : 'connections.removeBody', {
              name: removing ? connectionName(removing, t('connections.untitled')) : '',
            })}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRemoving(undefined)}>
              {t('common.cancel')}
            </Button>
            <Button color="red" onClick={confirmRemove} loading={remove.isPending}>
              {t('connections.remove')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
