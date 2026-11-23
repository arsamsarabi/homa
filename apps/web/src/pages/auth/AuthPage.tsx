import { Alert, Anchor, Button, Stack, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { AccountFields } from '@/components';
import { useInstance } from '@/hooks/instance';
import { type AuthMode, useAuthForm } from '@/hooks/session';
import { isolate } from '@/lib/i18n';
import { AuthCard } from './AuthCard';
import { ResendVerification } from './ResendVerification';

/** Sign-in or sign-up form. The first account is made in the setup journey instead. */
export function AuthPage({ mode }: { mode: AuthMode }): JSX.Element {
  const { t } = useTranslation();
  const { error, busy, checkEmail, unconfirmed, submit } = useAuthForm(mode);
  const signUp = mode === 'sign-up';
  // The route guards have loaded the instance; the sign-up link hides while sign-ups are closed.
  const instance = useInstance().data;

  if (checkEmail) {
    return (
      <AuthCard title={t('auth.checkEmailTitle')}>
        <Text>{t('auth.checkEmail', { email: isolate(checkEmail) })}</Text>
        <ResendVerification email={checkEmail} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t(signUp ? 'auth.signUpTitle' : 'auth.signInTitle')}>
      <form onSubmit={submit}>
        <Stack>
          {error && (
            <Alert color="red" role="alert">
              {t('auth.failed', { message: error })}
            </Alert>
          )}
          {unconfirmed && (
            <Alert color="yellow" role="alert">
              {t('auth.notConfirmed', { email: isolate(unconfirmed) })}
            </Alert>
          )}
          {!signUp && instance?.demo && (
            <Alert color="blue">{t('demo.signIn', { email: isolate(instance.demo.email) })}</Alert>
          )}
          <AccountFields signUp={signUp} defaults={signUp ? null : instance?.demo} />
          {!signUp &&
            (instance?.passwordReset ? (
              <Anchor component={Link} to="/forgot-password" size="sm">
                {t('auth.forgot')}
              </Anchor>
            ) : (
              <Text size="sm" c="dimmed">
                {t('auth.forgotNoEmail')}
              </Text>
            ))}
          <Button type="submit" loading={busy} fullWidth>
            {t(signUp ? 'auth.signUp' : 'auth.signIn')}
          </Button>
          {(signUp || instance?.signUpsOpen) && (
            <Text size="sm" ta="center">
              {t(signUp ? 'auth.haveAccount' : 'auth.noAccount')}{' '}
              <Anchor component={Link} to={signUp ? '/sign-in' : '/sign-up'}>
                {t(signUp ? 'auth.signIn' : 'auth.signUp')}
              </Anchor>
            </Text>
          )}
        </Stack>
      </form>
    </AuthCard>
  );
}

export const SignInPage = (): JSX.Element => <AuthPage mode="sign-in" />;
export const SignUpPage = (): JSX.Element => <AuthPage mode="sign-up" />;
