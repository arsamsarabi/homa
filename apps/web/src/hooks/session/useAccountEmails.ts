// The account email flows: sending a confirmation link again, asking for a password reset link,
// and setting the new password from one.
import { type FormEvent, useState } from 'react';
import { authClient } from '@/api';
import { VERIFY_EMAIL_PATH } from './useAuthForm';

/** Must match the server's page for reset links. */
export const RESET_PASSWORD_PATH = '/reset-password';

export type SendState = 'idle' | 'busy' | 'sent' | 'failed';
/** Better Auth's code for a reset link that expired or was already used. */
const INVALID_TOKEN = 'INVALID_TOKEN';

/** Runs `action` with the form's data, tracking busy, sent and failed. */
function useFormAction(action: (form: FormData) => Promise<SendState>): {
  state: SendState;
  submit: (e: FormEvent<HTMLFormElement>) => void;
} {
  const [state, setState] = useState<SendState>('idle');
  function submit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setState('busy');
    action(new FormData(e.currentTarget))
      .then(setState)
      .catch(() => setState('failed'));
  }
  return { state, submit };
}

/** Sends the confirmation link again to the form's `email`. */
export function useResendVerification(): { state: SendState; submit: (e: FormEvent<HTMLFormElement>) => void } {
  return useFormAction(async (form) => {
    const res = await authClient.sendVerificationEmail({
      email: String(form.get('email')),
      callbackURL: VERIFY_EMAIL_PATH,
    });
    return res.error ? 'failed' : 'sent';
  });
}

/** Asks for a reset link for the form's `email`. The answer is the same whether or not it has an account. */
export function useForgotPassword(): { state: SendState; submit: (e: FormEvent<HTMLFormElement>) => void } {
  return useFormAction(async (form) => {
    const res = await authClient.requestPasswordReset({
      email: String(form.get('email')),
      redirectTo: RESET_PASSWORD_PATH,
    });
    return res.error ? 'failed' : 'sent';
  });
}

export type ResetState = SendState | 'expired';

/** Sets the form's `password` with the reset link's `token`. */
export function useResetPassword(token: string): {
  state: ResetState;
  submit: (e: FormEvent<HTMLFormElement>) => void;
} {
  const [expired, setExpired] = useState(false);
  const { state, submit } = useFormAction(async (form) => {
    const res = await authClient.resetPassword({ newPassword: String(form.get('password')), token });
    if (res.error?.code === INVALID_TOKEN) setExpired(true);
    return res.error ? 'failed' : 'sent';
  });
  return { state: expired ? 'expired' : state, submit };
}
