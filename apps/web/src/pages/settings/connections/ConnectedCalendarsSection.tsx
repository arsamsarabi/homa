import { Alert, Button, Group, Loader, Modal, Stack, Text, Title } from '@mantine/core';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { type JSX, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { useConnectionMutations, useConnections } from '@/hooks/connections';
import { useInstance } from '@/hooks/instance';
import { CalendarEditDrawer } from '@/pages/settings/calendars';
import type { Calendar, Connection } from '@/schemas';
import { useAnnouncer } from '@/stores';
import { CaldavDrawer } from './CaldavDrawer';
import classes from './ConnectedCalendarsSection.module.css';
import { ConnectionItem, connectionName } from './ConnectionItem';
import { SubscribeDrawer } from './SubscribeDrawer';

/**
 * Settings section: connected calendars (ICS feeds, public holidays, CalDAV, Google and Microsoft
 * accounts) with their sync status. The OAuth callbacks land here with ?google={id} or
 * ?microsoft={id} (open its calendar picker), or ?googleError=… / ?microsoftError=…; they're read
 * once and cleared from the URL.
 */
export function ConnectedCalendarsSection(): JSX.Element {
  const { t, i18n } = useTranslation();
  const headingId = useId();
  const connections = useConnections();
  const { syncNow, remove, dismissNotice, removeCalendar } = useConnectionMutations();
  const announce = useAnnouncer((s) => s.announce);
  const instance = useInstance().data;
  const googleOn = instance?.googleCalendar === true;
  const microsoftOn = instance?.microsoftCalendar === true;
  const search = useSearch({ from: '/_app/settings' });
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  // The account drawer: closed, adding a CalDAV account (null) or choosing an account's calendars (its id).
  const [caldav, setCaldav] = useState<string | null | undefined>(search.google ?? search.microsoft);
  // The i18n key of why a Google or Microsoft connect failed.
  const [oauthError, setOauthError] = useState(
    search.googleError
      ? `google.errors.${search.googleError}`
      : search.microsoftError
        ? `microsoft.errors.${search.microsoftError}`
        : undefined,
  );
  const fromCallback = Boolean(search.google || search.googleError || search.microsoft || search.microsoftError);
  useEffect(() => {
    if (fromCallback) void navigate({ to: '/settings', search: {}, replace: true });
  }, [fromCallback, navigate]);
  const [editing, setEditing] = useState<Calendar>();
  const [removing, setRemoving] = useState<Connection>();
  const [removingCalendar, setRemovingCalendar] = useState<Calendar>();
  const format = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language],
  );
  const formatTime = (iso: string): string => format.format(new Date(iso));

  const sync = (id: string): void =>
    syncNow.mutate(id, {
      onSuccess: (c: Connection) =>
        announce(t(c.status === 'ok' ? 'connections.synced' : 'connections.syncFailed'), {
          kind: c.status === 'ok' ? 'success' : 'error',
        }),
    });
  const confirmRemove = (): void => {
    if (!removing) return;
    remove.mutate(removing.id, {
      onSuccess: () => announce(t('connections.removed')),
      onSettled: () => setRemoving(undefined),
    });
  };

  const confirmRemoveCalendar = (): void => {
    if (!removingCalendar) return;
    removeCalendar.mutate(removingCalendar.id, {
      onSuccess: () => announce(t('connections.removed')),
      onSettled: () => setRemovingCalendar(undefined),
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
        {googleOn && (
          // A full page load: the API redirects to Google's consent screen.
          <Button variant="default" component="a" href="/api/connections/google/start">
            {t('google.add')}
          </Button>
        )}
        {microsoftOn && (
          <Button variant="default" component="a" href="/api/connections/microsoft/start">
            {t('microsoft.add')}
          </Button>
        )}
      </Group>
      {oauthError && (
        <Alert color="red" role="alert" withCloseButton onClose={() => setOauthError(undefined)}>
          {t(oauthError)}
        </Alert>
      )}
      {connections.isPending && <Loader size="sm" aria-label={t('connections.loading')} />}
      {connections.isError && (
        <QueryErrorAlert
          title={t('connections.loadFailed')}
          error={connections.error}
          onRetry={() => void connections.refetch()}
        />
      )}
      {(syncNow.isError || remove.isError || dismissNotice.isError || removeCalendar.isError) && (
        <Alert color="red" role="alert">
          {(syncNow.error ?? remove.error ?? dismissNotice.error ?? removeCalendar.error)?.message}
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
              onRemoveCalendar={setRemovingCalendar}
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
            {t(removing && removing.provider !== 'ics' ? 'caldav.removeBody' : 'connections.removeBody', {
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
      <Modal
        opened={removingCalendar !== undefined}
        onClose={() => setRemovingCalendar(undefined)}
        title={t('connections.removeTitle')}
      >
        <Stack>
          <Text size="sm">{t('connections.removeMissingBody', { name: removingCalendar?.name ?? '' })}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRemovingCalendar(undefined)}>
              {t('common.cancel')}
            </Button>
            <Button color="red" onClick={confirmRemoveCalendar} loading={removeCalendar.isPending}>
              {t('connections.removeFromHoma')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
