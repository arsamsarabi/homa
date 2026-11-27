import { Button, Group, Stack, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

/** Step four: all set. */
export function DoneStep({ onBack }: { onBack: () => void }): JSX.Element {
  const { t } = useTranslation();
  return (
    <Stack mt="md">
      <Text>{t('setup.done')}</Text>
      <Group>
        <Button variant="default" onClick={onBack}>
          {t('setup.back')}
        </Button>
        <Button component={Link} to="/">
          {t('onboarding.continue')}
        </Button>
      </Group>
    </Stack>
  );
}
