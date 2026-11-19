import { Alert, Button, Group, Loader, Modal, Stack, Text, Title } from '@mantine/core';
import { type JSX, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { useConnectionMutations, useConnections } from '@/hooks/connections';
import type { Connection } from '@/schemas';
import { useAnnouncer } from '@/stores';
import classes from './ConnectedCalendarsSection.module.css';
import { ConnectionItem } from './ConnectionItem';
import { SubscribeDrawer } from './SubscribeDrawer';

/** Settings section: subscribed calendars (ICS feeds, public holidays) with their sync status. */
export function ConnectedCalendarsSection(): JSX.Element {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const connections = useConnections();
  const { syncNow, remove } = useConnectionMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [adding, setAdding] = useState(false);
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
      </Group>
      {connections.isPending && <Loader size="sm" aria-label={t('connections.loading')} />}
      {connections.isError && (
        <QueryErrorAlert
          title={t('connections.loadFailed')}
          error={connections.error}
          onRetry={() => void connections.refetch()}
        />
      )}
      {(syncNow.isError || remove.isError) && (
        <Alert color="red" role="alert">
          {(syncNow.error ?? remove.error)?.message}
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
            />
          ))}
        </Stack>
      )}
      <SubscribeDrawer opened={adding} onClose={() => setAdding(false)} />
      <Modal
        opened={removing !== undefined}
        onClose={() => setRemoving(undefined)}
        title={t('connections.removeTitle')}
      >
        <Stack>
          <Text size="sm">
            {t('connections.removeBody', { name: removing?.calendars[0]?.name ?? t('connections.untitled') })}
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
