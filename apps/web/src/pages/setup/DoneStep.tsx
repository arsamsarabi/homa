import { Button, Stack, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

/** Step four: all set. */
export function DoneStep(): JSX.Element {
  const { t } = useTranslation();
  return (
    <Stack mt="md">
      <Text>{t('setup.done')}</Text>
      <Button component={Link} to="/" w="fit-content">
        {t('onboarding.continue')}
      </Button>
    </Stack>
  );
}
