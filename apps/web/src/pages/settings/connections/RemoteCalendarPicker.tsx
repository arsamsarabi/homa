import { Alert, Button, Checkbox, ColorSwatch, Group, Loader, Stack, Text } from '@mantine/core';
import { type JSX, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { useConnectionMutations, useConnections, useRemoteCalendars } from '@/hooks/connections';
import { useAnnouncer } from '@/stores';
import { providerName } from './ConnectionItem';

export type RemoteCalendarPickerProps = { connectionId: string; onDone: () => void };

/**
 * Checkboxes for the calendars on a CalDAV, Google or Microsoft account; saving makes exactly the checked ones
 * sync. Synced calendars the account no longer has are listed too, marked deleted.
 */
export function RemoteCalendarPicker({ connectionId, onDone }: RemoteCalendarPickerProps): JSX.Element {
  const { t } = useTranslation();
  const remote = useRemoteCalendars(connectionId);
  const { choose } = useConnectionMutations();
  const announce = useAnnouncer((s) => s.announce);
  const provider = useConnections().data?.find((c) => c.id === connectionId)?.provider;
  const [checked, setChecked] = useState<string[]>();

  // Start from what syncs now, or everything for a new account.
  useEffect(() => {
    if (!remote.data || checked) return;
    const selected = remote.data.filter((c) => c.selected).map((c) => c.remoteId);
    setChecked(selected.length ? selected : remote.data.map((c) => c.remoteId));
  }, [remote.data, checked]);

  const save = (): void =>
    choose.mutate(
      { id: connectionId, remoteIds: checked ?? [] },
      {
        onSuccess: () => {
          announce(t('caldav.saved'));
          onDone();
        },
      },
    );

  if (remote.isPending) return <Loader size="sm" aria-label={t('caldav.loadingCalendars')} />;
  if (remote.isError)
    return (
      <QueryErrorAlert title={t('caldav.calendarsFailed')} error={remote.error} onRetry={() => void remote.refetch()} />
    );

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {t('caldav.chooseHint')}
      </Text>
      {remote.data.length === 0 ? (
        <Text size="sm">{t('caldav.noCalendars')}</Text>
      ) : (
        <Checkbox.Group value={checked ?? []} onChange={setChecked} label={t('caldav.calendars')}>
          <Stack gap="xs" mt="xs">
            {remote.data.map((c) => (
              <Checkbox
                key={c.remoteId}
                value={c.remoteId}
                label={
                  <Group gap="xs" wrap="nowrap">
                    <ColorSwatch color={c.color ?? 'gray'} size={12} aria-hidden />
                    <span>{c.name ?? t('connections.untitled')}</span>
                    {c.readOnly && !c.missing && (
                      <Text span size="xs" c="dimmed">
                        {t('connections.readOnly')}
                      </Text>
                    )}
                    {c.missing && (
                      <Text span size="xs" c="red">
                        {t('connections.deletedOn', { provider: providerName(provider, t) })}
                      </Text>
                    )}
                  </Group>
                }
              />
            ))}
          </Stack>
        </Checkbox.Group>
      )}
      {choose.isError && (
        <Alert color="red" role="alert">
          {choose.error.message}
        </Alert>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button onClick={save} loading={choose.isPending}>
          {t('caldav.save')}
        </Button>
      </Group>
    </Stack>
  );
}
