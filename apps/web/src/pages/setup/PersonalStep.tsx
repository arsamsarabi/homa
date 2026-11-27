import { Alert, Button, Group, Loader, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert, SettingsFields } from '@/components';
import { useSettings, useSettingsDraft } from '@/hooks/settings';
import { browserTimeZone } from '@/services/zones';

/** Step three: the admin's own settings, as every new account sees them in onboarding. */
export function PersonalStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }): JSX.Element {
  const { t } = useTranslation();
  const settings = useSettings();
  const draft = useSettingsDraft();
  if (settings.isPending) return <Loader mt="md" aria-label={t('setup.loadingSettings')} />;
  if (settings.isError)
    return (
      <QueryErrorAlert
        title={t('setup.settingsLoadFailed')}
        error={settings.error}
        onRetry={(): void => void settings.refetch()}
      />
    );

  const save = (): void => {
    draft
      .save()
      .then(onDone)
      .catch(() => undefined); // the error shows above the button through draft.error
  };
  return (
    <Stack mt="md">
      <Text size="sm">{t('setup.personalIntro')}</Text>
      <SettingsFields value={draft.value} browserTz={browserTimeZone()} onChange={draft.change} />
      {draft.error && (
        <Alert color="red" role="alert">
          {t('settings.saveFailed', { message: draft.error })}
        </Alert>
      )}
      <Group>
        <Button variant="default" onClick={onBack} disabled={draft.busy}>
          {t('setup.back')}
        </Button>
        <Button onClick={save} loading={draft.busy}>
          {t('setup.continue')}
        </Button>
      </Group>
    </Stack>
  );
}
