import { Alert, Button, Container, Group, Stack, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsFields } from '@/components';
import { useSettingsDraft } from '@/hooks/settings';
import { browserTimeZone } from '@/services/zones';
import { useAnnouncer } from '@/stores';

/** Your settings: home time zone and the second calendar. Language and theme are in the header. */
export function SettingsPage(): JSX.Element {
  const { t } = useTranslation();
  const draft = useSettingsDraft();
  const announce = useAnnouncer((s) => s.announce);
  const save = (): void => {
    draft
      .save()
      .then(() => announce(t('settings.saved')))
      .catch(() => undefined); // the error shows in the form through draft.error
  };
  return (
    <Container size="sm" py="xl">
      <Stack>
        <Title order={1}>{t('settings.title')}</Title>
        {draft.error && (
          <Alert color="red" role="alert">
            {t('settings.saveFailed', { message: draft.error })}
          </Alert>
        )}
        <SettingsFields value={draft.value} browserTz={browserTimeZone()} onChange={draft.change} />
        <Group>
          <Button onClick={save} loading={draft.busy}>
            {t('settings.save')}
          </Button>
        </Group>
      </Stack>
    </Container>
  );
}
