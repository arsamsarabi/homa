import { PasswordInput, TextInput } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

export type AccountFieldsProps = { signUp: boolean };

/** Name (for a new account), email and password, named for the form's FormData. */
export function AccountFields({ signUp }: AccountFieldsProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <>
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
    </>
  );
}
