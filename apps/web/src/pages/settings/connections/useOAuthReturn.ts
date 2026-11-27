import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

export type OAuthReturn = {
  /** The account Google or Microsoft just connected, whose calendar picker should open. */
  connectedId: string | undefined;
  /** The i18n key of why a Google or Microsoft connect failed. */
  errorKey: string | undefined;
  clearError: () => void;
};

/**
 * The Google and Microsoft callbacks land on /settings with ?google={id} or ?microsoft={id}, or
 * ?googleError=… / ?microsoftError=…. Reads them once, then clears them from the URL.
 */
export function useOAuthReturn(): OAuthReturn {
  const search = useSearch({ from: '/_app/settings' });
  const navigate = useNavigate();
  const [connectedId] = useState(search.google ?? search.microsoft);
  const [errorKey, setErrorKey] = useState(
    search.googleError
      ? `google.errors.${search.googleError}`
      : search.microsoftError
        ? `microsoft.errors.${search.microsoftError}`
        : undefined,
  );
  const fromCallback = Boolean(search.google || search.googleError || search.microsoft || search.microsoftError);
  useEffect(() => {
    if (fromCallback) void navigate({ to: '/settings', search: { tab: 'calendars' }, replace: true });
  }, [fromCallback, navigate]);
  return { connectedId, errorKey, clearError: (): void => setErrorKey(undefined) };
}
