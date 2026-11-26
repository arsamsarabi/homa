import { Alert, Button, Container, Radio, Stack, Text, Title } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsFields } from '@/components';
import { useSession } from '@/hooks/session';
import { useSettingsDraft } from '@/hooks/settings';
import type { SharingPreset } from '@/schemas';
import { browserTimeZone } from '@/services/zones';

/** Onboarding shows "details"; the API stores that as `read`. */
const toPreset = (v: string): SharingPreset => (v === 'details' ? 'read' : (v as SharingPreset));

export function OnboardingPage(): JSX.Element {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const draft = useSettingsDraft();
  const navigate = useNavigate();
  // Preselect free/busy (design decision 11); new accounts start private in the API until this saves.
  const [visibility, setVisibility] = useState('freebusy');
  const finish = (): void => {
    draft
      .save({ sharingPreset: toPreset(visibility) })
      .then(() => navigate({ to: '/' }))
      .catch(() => undefined); // the error shows above the button through draft.error
  };

  return (
    <Container size="sm" py="xl">
      <Stack>
        <Title order={1}>{t('onboarding.title', { name: session?.user.name })}</Title>
        <Text c="dimmed">{t('onboarding.intro')}</Text>
        <SettingsFields value={draft.value} browserTz={browserTimeZone()} onChange={draft.change} hideSharing />
        <Radio.Group
          label={t('onboarding.visibility')}
          value={visibility}
          onChange={(v: string): void => {
            setVisibility(v);
            draft.change({ sharingPreset: toPreset(v) });
          }}
        >
          <Stack mt="xs">
            <Radio value="private" label={t('onboarding.visibilityPrivate')} />
            <Radio value="freebusy" label={t('onboarding.visibilityFreeBusy')} />
            <Radio value="details" label={t('onboarding.visibilityDetails')} />
          </Stack>
        </Radio.Group>
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
