import { Alert, Button, Container, Radio, Stack, Text, Title } from '@mantine/core';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { sessionQuery } from '../session';

// shortcut: the visibility choice isn't saved yet; it gets a column and an API with sharing (phase 6).
export function Onboarding() {
  const { t } = useTranslation();
  const { data: session } = useSuspenseQuery(sessionQuery);

  return (
    <Container size="sm" py="xl">
      <Stack>
        <Title order={1}>{t('onboarding.title', { name: session?.user.name })}</Title>
        <Text c="dimmed">{t('onboarding.intro')}</Text>
        <Radio.Group label={t('onboarding.visibility')} defaultValue="freebusy">
          <Stack mt="xs">
            <Radio value="private" label={t('onboarding.visibilityPrivate')} />
            <Radio value="freebusy" label={t('onboarding.visibilityFreeBusy')} />
            <Radio value="details" label={t('onboarding.visibilityDetails')} />
          </Stack>
        </Radio.Group>
        <Alert variant="light">{t('onboarding.comingSoon')}</Alert>
        <Button component={Link} to="/" w="fit-content">
          {t('onboarding.continue')}
        </Button>
      </Stack>
    </Container>
  );
}
