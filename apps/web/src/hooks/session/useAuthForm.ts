// Sign-in and sign-up: calls Better Auth, refreshes the cached session, then moves on.
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { authClient } from '@/api';
import { sessionQuery } from './session-query';

export type AuthMode = 'sign-in' | 'sign-up';
export type AuthForm = { error: string | undefined; busy: boolean; submit: (e: FormEvent<HTMLFormElement>) => void };

export function useAuthForm(mode: AuthMode): AuthForm {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function send(form: FormData): Promise<void> {
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    const res =
      mode === 'sign-up'
        ? await authClient.signUp.email({ email, password, name: String(form.get('name')) })
        : await authClient.signIn.email({ email, password });
    if (res.error) {
      setError(res.error.message ?? res.error.statusText);
      return;
    }
    // Refetch now: the route guard reads the cached session, which still says signed out.
    await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 });
    await navigate({ to: mode === 'sign-up' ? '/onboarding' : '/' });
  }

  function submit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    send(new FormData(e.currentTarget))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  }

  return { error, busy, submit };
}
