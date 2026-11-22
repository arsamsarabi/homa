import { Button, Text } from '@mantine/core';
import { Link, useSearch } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/hooks/session';
import { AuthCard } from './AuthCard';
import { ResendVerification } from './ResendVerification';

/**
 * Where a confirmation link lands. Confirmed: the server has signed the account in, so it goes on
 * to the welcome step (or to sign in, when the address was confirmed before). Failed: send a new link.
 */
export function VerifyEmailPage(): JSX.Element {
  const { t } = useTranslation();
  const { error } = useSearch({ from: '/verify-email' });
  const { data: session } = useSession();

  if (error) {
    return (
      <AuthCard title={t('auth.verifyFailedTitle')}>
        <Text>{t(error === 'TOKEN_EXPIRED' ? 'auth.verifyExpired' : 'auth.verifyInvalid')}</Text>
        <ResendVerification />
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t('auth.verifiedTitle')}>
      <Text>{t('auth.verified')}</Text>
      {session ? (
        <Button component={Link} to="/onboarding" fullWidth>
          {t('auth.continue')}
        </Button>
      ) : (
        <Button component={Link} to="/sign-in" fullWidth>
          {t('auth.signIn')}
        </Button>
      )}
    </AuthCard>
  );
}
