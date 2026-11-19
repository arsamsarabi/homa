import { Alert, Anchor, Button, Center, Image, Paper, Stack, Text, Title } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { AccountFields } from '@/components';
import { useInstance } from '@/hooks/instance';
import { type AuthMode, useAuthForm } from '@/hooks/session';

/** Sign-in or sign-up form. The first account is made in the setup journey instead. */
export function AuthPage({ mode }: { mode: AuthMode }): JSX.Element {
  const { t } = useTranslation();
  const { error, busy, submit } = useAuthForm(mode);
  const signUp = mode === 'sign-up';
  // The route guards have loaded the instance; the sign-up link hides while sign-ups are closed.
  const instance = useInstance().data;

  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder p="xl" w="100%" maw={400}>
        <form onSubmit={submit}>
          <Stack>
            <Image src="/homa-capital-320.webp" alt="" w={120} mx="auto" />
            {instance && (
              <Text c="dimmed" ta="center">
                {instance.name}
              </Text>
            )}
            <Title order={1} ta="center">
              {t(signUp ? 'auth.signUpTitle' : 'auth.signInTitle')}
            </Title>
            {error && (
              <Alert color="red" role="alert">
                {t('auth.failed', { message: error })}
              </Alert>
            )}
            <AccountFields signUp={signUp} />
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
      </Paper>
    </Center>
  );
}

export const SignInPage = (): JSX.Element => <AuthPage mode="sign-in" />;
export const SignUpPage = (): JSX.Element => <AuthPage mode="sign-up" />;
