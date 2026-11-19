import { Alert, Button, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { AccountFields } from '@/components';
import { useAuthForm } from '@/hooks/session';

/** Step one: the admin's own account, signed in once it's made. */
export function AdminAccountStep({ onDone }: { onDone: () => void }): JSX.Element {
  const { t } = useTranslation();
  const { error, busy, submit } = useAuthForm('sign-up', onDone);
  return (
    <form onSubmit={submit}>
      <Stack mt="md" maw={400}>
        <Text size="sm">{t('setup.accountIntro')}</Text>
        {error && (
          <Alert color="red" role="alert">
            {t('auth.failed', { message: error })}
          </Alert>
        )}
        <AccountFields signUp />
        <Button type="submit" loading={busy} w="fit-content">
          {t('setup.createAdmin')}
        </Button>
      </Stack>
    </form>
  );
}
