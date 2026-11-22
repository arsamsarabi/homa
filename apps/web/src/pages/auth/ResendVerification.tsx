import { Alert, Button, Stack, TextInput } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useResendVerification } from '@/hooks/session';

/** Sends the confirmation link again: to `email` when it's known, else to the address typed in. */
export function ResendVerification({ email }: { email?: string }): JSX.Element {
  const { t } = useTranslation();
  const { state, submit } = useResendVerification();
  return (
    <form onSubmit={submit}>
      <Stack>
        {email ? (
          <input type="hidden" name="email" value={email} />
        ) : (
          <TextInput name="email" type="email" label={t('auth.email')} required autoComplete="email" />
        )}
        {state === 'sent' && (
          <Alert color="green" role="status">
            {t('auth.resent')}
          </Alert>
        )}
        {state === 'failed' && (
          <Alert color="red" role="alert">
            {t('auth.sendFailed')}
          </Alert>
        )}
        <Button type="submit" variant={email ? 'default' : 'filled'} loading={state === 'busy'} fullWidth>
          {t('auth.resend')}
        </Button>
      </Stack>
    </form>
  );
}
