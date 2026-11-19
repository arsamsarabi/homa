import { Alert, Button, Container, Radio, Stack, Text, Title } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsFields } from '@/components';
import { useSession } from '@/hooks/session';
import { useSettingsDraft } from '@/hooks/settings';
import { browserTimeZone } from '@/services/zones';

// shortcut: the visibility choice isn't saved yet; it gets a column and an API with sharing (phase 6).
export function OnboardingPage(): JSX.Element {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const draft = useSettingsDraft();
  const navigate = useNavigate();
  const finish = (): void => {
    draft
      .save()
      .then(() => navigate({ to: '/' }))
      .catch(() => undefined); // the error shows above the button through draft.error
  };

  return (
    <Container size="sm" py="xl">
      <Stack>
        <Title order={1}>{t('onboarding.title', { name: session?.user.name })}</Title>
        <Text c="dimmed">{t('onboarding.intro')}</Text>
        <SettingsFields value={draft.value} browserTz={browserTimeZone()} onChange={draft.change} />
        <Radio.Group label={t('onboarding.visibility')} defaultValue="freebusy">
          <Stack mt="xs">
            <Radio value="private" label={t('onboarding.visibilityPrivate')} />
            <Radio value="freebusy" label={t('onboarding.visibilityFreeBusy')} />
            <Radio value="details" label={t('onboarding.visibilityDetails')} />
          </Stack>
        </Radio.Group>
        <Alert variant="light">{t('onboarding.comingSoon')}</Alert>
        {draft.error && (
          <Alert color="red" role="alert">
            {t('settings.saveFailed', { message: draft.error })}
          </Alert>
        )}
        <Button onClick={finish} loading={draft.busy} w="fit-content">
          {t('onboarding.continue')}
        </Button>
      </Stack>
    </Container>
  );
}
