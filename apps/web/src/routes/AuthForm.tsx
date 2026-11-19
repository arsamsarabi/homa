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
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authClient } from '../auth-client';
import { sessionQuery } from '../session';

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const signUp = mode === 'sign-up';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    setBusy(true);
    setError(undefined);
    const res = signUp
      ? await authClient.signUp.email({ email, password, name: String(form.get('name')) })
      : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message ?? res.error.statusText);
      return;
    }
    // Refetch now: the route guard reads the cached session, which still says signed out.
    await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 });
    await navigate({ to: signUp ? '/onboarding' : '/' });
  }

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
