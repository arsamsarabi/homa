import { Alert, Button, Drawer, Group, PasswordInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { type ChangeEvent, type FormEvent, type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectionMutations } from '@/hooks/connections';
import type { Connection } from '@/schemas';
import { useAnnouncer } from '@/stores';
import { RemoteCalendarPicker } from './RemoteCalendarPicker';

export type CaldavDrawerProps = {
  opened: boolean;
  /** An existing CalDAV connection: open straight on choosing its calendars. */
  connectionId?: string;
  onClose: () => void;
};

/** Servers people often use, with the address to fill in. Nextcloud's needs the user's own host. */
const PRESETS = {
  icloud: 'https://caldav.icloud.com',
  fastmail: 'https://caldav.fastmail.com',
  mailbox: 'https://dav.mailbox.org',
  posteo: 'https://posteo.de:8443',
  zoho: 'https://calendar.zoho.com',
  nextcloud: 'https://',
  other: '',
} as const;
type Preset = keyof typeof PRESETS;

/** Connect a CalDAV account with an app password, then choose which of its calendars sync. */
export function CaldavDrawer({ opened, connectionId, onClose }: CaldavDrawerProps): JSX.Element {
  const { t } = useTranslation();
  const { addCaldav } = useConnectionMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [preset, setPreset] = useState<Preset>('icloud');
  const [serverUrl, setServerUrl] = useState<string>(PRESETS.icloud);
  const [added, setAdded] = useState<string>();
  const choosing = connectionId ?? added;

  const close = (): void => {
    addCaldav.reset();
    setAdded(undefined);
    onClose();
  };

  const pick = (value: string | null): void => {
    const next = (value ?? 'other') as Preset;
    setPreset(next);
    setServerUrl(PRESETS[next]);
  };

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    addCaldav.mutate(
      { serverUrl, username: String(form.get('username') ?? ''), password: String(form.get('password') ?? '') },
      {
        onSuccess: (c: Connection): void => {
          announce(t('caldav.connected'));
          setAdded(c.id);
        },
      },
    );
  };

  return (
    <Drawer
      opened={opened}
      onClose={close}
      position="right"
      size="md"
      padding="lg"
      title={choosing ? t('caldav.chooseTitle') : t('caldav.title')}
    >
      {choosing ? (
        <RemoteCalendarPicker connectionId={choosing} onDone={close} />
      ) : (
        <form onSubmit={submit}>
          <Stack>
            <Select
              label={t('caldav.provider')}
              data={(Object.keys(PRESETS) as Preset[]).map((p) => ({ value: p, label: t(`caldav.presets.${p}`) }))}
              value={preset}
              onChange={pick}
              allowDeselect={false}
            />
            <TextInput
              label={t('caldav.server')}
              description={t(`caldav.hints.${preset}`)}
              value={serverUrl}
              onChange={(e: ChangeEvent<HTMLInputElement>): void => setServerUrl(e.currentTarget.value)}
              placeholder="https://"
              type="url"
              required
            />
            <TextInput name="username" label={t('caldav.username')} autoComplete="username" required data-autofocus />
            <PasswordInput
              name="password"
              label={t('caldav.password')}
              description={t('caldav.passwordHint')}
              autoComplete="off"
              required
            />
            {addCaldav.isError && (
              <Alert color="red" role="alert">
                {addCaldav.error.message}
              </Alert>
            )}
            {addCaldav.isPending && (
              <Text size="sm" role="status">
                {t('caldav.checking')}
              </Text>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={addCaldav.isPending}>
                {t('caldav.connect')}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Drawer>
  );
}
