import { Alert, Button, Loader, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { InstanceFields, QueryErrorAlert } from '@/components';
import { useInstanceSettingsDraft } from '@/hooks/instance';

/** Step two: the instance's settings, pre-filled with the defaults. */
export function InstanceStep({ onDone }: { onDone: () => void }): JSX.Element {
  const { t } = useTranslation();
  const draft = useInstanceSettingsDraft();
  if (draft.status === 'pending') return <Loader mt="md" aria-label={t('instance.loading')} />;
  if (draft.status === 'error')
    return <QueryErrorAlert title={t('instance.loadFailed')} error={draft.error} onRetry={draft.retry} />;

  const save = (): void => {
    draft
      .save()
      .then(onDone)
      .catch(() => undefined); // the error shows above the button through draft.error
  };
  return (
    <Stack mt="md">
      <Text size="sm">{t('setup.instanceIntro')}</Text>
      <InstanceFields value={draft.value} onChange={draft.change} />
      {draft.error && (
        <Alert color="red" role="alert">
          {t('instance.saveFailed', { message: draft.error })}
        </Alert>
      )}
      <Button onClick={save} loading={draft.busy} disabled={draft.value.name.trim() === ''} w="fit-content">
        {t('setup.continue')}
      </Button>
    </Stack>
  );
}
