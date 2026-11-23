// Sign-in and sign-up: calls Better Auth, refreshes the cached session, then moves on. When the
// server wants new accounts to confirm their email address, sign-up ends on "check your email"
// instead, and signing in unconfirmed says so (the server has just sent a fresh link).
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { authClient } from '@/api';
import { instanceQuery } from '@/hooks/instance';
import { sessionQuery } from './session-query';

/** Must match the server's header for the first-run setup code. */
export const SETUP_CODE_HEADER = 'x-homa-setup-code';
/** Must match the server's header for an invite token (INVITE_HEADER). */
export const INVITE_HEADER = 'x-homa-invite';
/** The page confirmation links land on (the server's VERIFY_EMAIL_PATH). */
export const VERIFY_EMAIL_PATH = '/verify-email';

export type AuthMode = 'sign-in' | 'sign-up';
export type AuthForm = {
  error: string | undefined;
  busy: boolean;
  /** Signed up; the account waits for its address to be confirmed. */
  checkEmail: string | undefined;
  /** Sign-in refused until the address is confirmed. */
  unconfirmed: string | undefined;
  submit: (e: FormEvent<HTMLFormElement>) => void;
};

/**
 * With `onDone`, calls it after signing in or up instead of moving on to the next page. `invite` is
 * the token from an invite link, sent with the sign-up.
 */
export function useAuthForm(mode: AuthMode, onDone?: () => void, invite?: string): AuthForm {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState<string>();
  const [unconfirmed, setUnconfirmed] = useState<string>();

  async function send(form: FormData): Promise<void> {
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    // No callbackURL here: Better Auth's client would follow it after signing in. The server points
    // confirmation links at VERIFY_EMAIL_PATH itself.
    const signIn = (): ReturnType<typeof authClient.signIn.email> => authClient.signIn.email({ email, password });
    let res =
      mode === 'sign-up'
        ? await authClient.signUp.email({
            email,
            password,
            name: String(form.get('name')),
            fetchOptions: {
              headers: {
                // The first account (the admin) needs the setup code from the server log.
                ...(form.has('setupCode') && { [SETUP_CODE_HEADER]: String(form.get('setupCode')).trim() }),
                ...(invite && { [INVITE_HEADER]: invite }),
              },
            },
          })
        : await signIn();
    if (res.error) {
      if (res.error.code === 'EMAIL_NOT_VERIFIED') setUnconfirmed(email);
      else setError(res.error.message ?? res.error.statusText);
      return;
    }
    // With confirmation required, sign-up doesn't sign in. The admin is confirmed at once, so they
    // sign in now; everyone else confirms their address first.
    if (mode === 'sign-up' && !res.data.token) {
      if (!res.data.user.emailVerified) {
        setCheckEmail(email);
        return;
      }
      res = await signIn();
      if (res.error) {
        setError(res.error.message ?? res.error.statusText);
        return;
      }
    }
    // Refetch now: the route guard reads the cached session, which still says signed out.
    await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 });
    // The first account finishes the instance's setup.
    if (mode === 'sign-up') await queryClient.invalidateQueries({ queryKey: instanceQuery.queryKey });
    if (onDone) onDone();
    else await navigate({ to: mode === 'sign-up' ? '/onboarding' : '/' });
  }

  function submit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setUnconfirmed(undefined);
    send(new FormData(e.currentTarget))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  }

  return { error, busy, checkEmail, unconfirmed, submit };
}
