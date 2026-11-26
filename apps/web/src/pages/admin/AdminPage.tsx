import { Alert, Button, Container, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { InstanceFields, QueryErrorAlert } from '@/components';
import { useInstance, useInstanceSettingsDraft } from '@/hooks/instance';
import { isolate } from '@/lib/i18n';
import { useAnnouncer } from '@/stores';

/** The instance's settings, for its admins. */
export function AdminPage(): JSX.Element {
  const { t } = useTranslation();
  const draft = useInstanceSettingsDraft();
  const announce = useAnnouncer((s) => s.announce);
  const oidc = useInstance().data?.oidc ?? null;

  let body: JSX.Element;
  if (draft.status === 'pending') body = <Loader aria-label={t('instance.loading')} />;
  else if (draft.status === 'error')
    body = <QueryErrorAlert title={t('instance.loadFailed')} error={draft.error} onRetry={draft.retry} />;
  else {
    const save = (): void => {
      draft
        .save()
        .then(() => announce(t('instance.saved')))
        .catch(() => undefined); // the error shows in the form through draft.error
    };
    body = (
      <>
        {draft.error && (
          <Alert color="red" role="alert">
            {t('instance.saveFailed', { message: draft.error })}
          </Alert>
        )}
        <InstanceFields value={draft.value} onChange={draft.change} />
        <Group>
          <Button onClick={save} loading={draft.busy} disabled={draft.busy || draft.value.name.trim() === ''}>
            {t('settings.save')}
          </Button>
        </Group>
      </>
    );
  }

  return (
    <Container size="sm" py="xl">
      <Stack>
        <Title order={1}>{t('instance.title')}</Title>
        {body}
        <Stack gap="xs" component="section" aria-labelledby="oidc-status">
          <Title order={2} size="h4" id="oidc-status">
            {t('instance.oidcTitle')}
          </Title>
          <Text size="sm" c="dimmed">
            {t('instance.oidcHint')}
          </Text>
          <Text size="sm">{oidc ? t('instance.oidcOn', { name: isolate(oidc.name) }) : t('instance.oidcOff')}</Text>
          {oidc && (
            <TextInput
              label={t('instance.oidcRedirect')}
              description={t('instance.oidcRedirectHint')}
              value={oidc.redirectUri}
              readOnly
            />
          )}
        </Stack>
      </Stack>
    </Container>
  );
}
