import { PasswordInput, TextInput } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

export type AccountFieldsProps = {
  signUp: boolean;
  /** An address the account must use (an invite for it): filled in and not editable. */
  fixedEmail?: string;
  /** Prefill email/password (demo sign-in). Ignored when `fixedEmail` is set. */
  defaults?: { email: string; password: string } | null;
};

/** Name (for a new account), email and password, named for the form's FormData. */
export function AccountFields({ signUp, fixedEmail, defaults }: AccountFieldsProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      {signUp && <TextInput name="name" label={t('auth.name')} required autoComplete="name" />}
      <TextInput
        name="email"
        type="email"
        label={t('auth.email')}
        required
        autoComplete="email"
        defaultValue={fixedEmail ?? defaults?.email}
        readOnly={fixedEmail !== undefined}
      />
      <PasswordInput
        name="password"
        label={t('auth.password')}
        description={signUp ? t('auth.passwordHint') : undefined}
        required
        minLength={8}
        defaultValue={defaults?.password}
        autoComplete={signUp ? 'new-password' : 'current-password'}
      />
    </>
  );
}
