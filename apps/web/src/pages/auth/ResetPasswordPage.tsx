import { Alert, Anchor, Button, PasswordInput, Stack, Text } from '@mantine/core';
import { Link, useSearch } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useResetPassword } from '@/hooks/session';
import { AuthCard } from './AuthCard';

/** Where a reset link lands: choose the new password, or ask for a new link when this one is spent. */
export function ResetPasswordPage(): JSX.Element {
  const { t } = useTranslation();
  const { token, error } = useSearch({ from: '/reset-password' });
  const { state, submit } = useResetPassword(token ?? '');

  if (state === 'sent') {
    return (
      <AuthCard title={t('auth.resetTitle')}>
        <Text>{t('auth.resetDone')}</Text>
        <Button component={Link} to="/sign-in" fullWidth>
          {t('auth.signIn')}
        </Button>
      </AuthCard>
    );
  }
  if (!token || error || state === 'expired') {
    return (
      <AuthCard title={t('auth.resetTitle')}>
        <Text>{t('auth.linkExpired')}</Text>
        <Button component={Link} to="/forgot-password" fullWidth>
          {t('auth.newLink')}
        </Button>
        <Anchor component={Link} to="/sign-in" size="sm" ta="center">
          {t('auth.backToSignIn')}
        </Anchor>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t('auth.resetTitle')}>
      <form onSubmit={submit}>
        <Stack>
          {state === 'failed' && (
            <Alert color="red" role="alert">
              {t('auth.sendFailed')}
            </Alert>
          )}
          <PasswordInput
            name="password"
            label={t('auth.newPassword')}
            description={t('auth.passwordHint')}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <Button type="submit" loading={state === 'busy'} fullWidth>
            {t('auth.resetSave')}
          </Button>
        </Stack>
      </form>
    </AuthCard>
  );
}
