import { Alert, Anchor, Button, Stack, Text, TextInput } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { type ChangeEvent, type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@/hooks/instance';
import { useForgotPassword } from '@/hooks/session';
import { isolate } from '@/lib/i18n';
import { AuthCard } from './AuthCard';

/** Asks for a reset link. Says the same thing whether or not the address has an account. */
export function ForgotPasswordPage(): JSX.Element {
  const { t } = useTranslation();
  const instance = useInstance().data;
  const { state, submit } = useForgotPassword();
  const [email, setEmail] = useState('');
  const back = (
    <Anchor component={Link} to="/sign-in" size="sm" ta="center">
      {t('auth.backToSignIn')}
    </Anchor>
  );

  if (!instance?.passwordReset) {
    return (
      <AuthCard title={t('auth.forgotTitle')}>
        <Text>{t('auth.forgotUnavailable')}</Text>
        {back}
      </AuthCard>
    );
  }
  if (state === 'sent') {
    return (
      <AuthCard title={t('auth.checkEmailTitle')}>
        <Text>{t('auth.forgotSent', { email: isolate(email) })}</Text>
        {back}
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t('auth.forgotTitle')}>
      <form onSubmit={submit}>
        <Stack>
          <Text size="sm">{t('auth.forgotIntro')}</Text>
          {state === 'failed' && (
            <Alert color="red" role="alert">
              {t('auth.sendFailed')}
            </Alert>
          )}
          <TextInput
            name="email"
            type="email"
            label={t('auth.email')}
            required
            autoComplete="email"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>): void => setEmail(e.currentTarget.value)}
          />
          <Button type="submit" loading={state === 'busy'} fullWidth>
            {t('auth.forgotSend')}
          </Button>
          {back}
        </Stack>
      </form>
    </AuthCard>
  );
}
