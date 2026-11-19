import {
  Alert,
  Anchor,
  Button,
  Center,
  Image,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { type AuthMode, useAuthForm } from '@/hooks/session';

/** Sign-in or sign-up form. The first account on an instance becomes its admin. */
export function AuthPage({ mode }: { mode: AuthMode }): JSX.Element {
  const { t } = useTranslation();
  const { error, busy, submit } = useAuthForm(mode);
  const signUp = mode === 'sign-up';

  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder p="xl" w="100%" maw={400}>
        <form onSubmit={submit}>
          <Stack>
            <Image src="/homa-capital-320.webp" alt="" w={120} mx="auto" />
            <Title order={1} ta="center">
              {t(signUp ? 'auth.signUpTitle' : 'auth.signInTitle')}
            </Title>
            {signUp && (
              <Text size="sm" c="dimmed" ta="center">
                {t('auth.firstUserNote')}
              </Text>
            )}
            {error && (
              <Alert color="red" role="alert">
                {t('auth.failed', { message: error })}
              </Alert>
            )}
            {signUp && <TextInput name="name" label={t('auth.name')} required autoComplete="name" />}
            <TextInput name="email" type="email" label={t('auth.email')} required autoComplete="email" />
            <PasswordInput
              name="password"
              label={t('auth.password')}
              description={signUp ? t('auth.passwordHint') : undefined}
              required
              minLength={8}
              autoComplete={signUp ? 'new-password' : 'current-password'}
            />
            <Button type="submit" loading={busy} fullWidth>
              {t(signUp ? 'auth.signUp' : 'auth.signIn')}
            </Button>
            <Text size="sm" ta="center">
              {t(signUp ? 'auth.haveAccount' : 'auth.noAccount')}{' '}
              <Anchor component={Link} to={signUp ? '/sign-in' : '/sign-up'}>
                {t(signUp ? 'auth.signIn' : 'auth.signUp')}
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}

export const SignInPage = (): JSX.Element => <AuthPage mode="sign-in" />;
export const SignUpPage = (): JSX.Element => <AuthPage mode="sign-up" />;
