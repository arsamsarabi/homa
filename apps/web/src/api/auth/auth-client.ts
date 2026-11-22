// Better Auth's browser client for sign-up, sign-in, sign-out and the session.
import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  basePath: '/api/auth',
  // Types the admin plugin's fields on the session (user.role).
  plugins: [adminClient()],
  // Look fetch up per request (not once at import) so tests can fake the network.
  fetchOptions: {
    customFetchImpl: (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      // Account emails (confirm your address, reset your password) come in the app's language.
      const headers = new Headers(init?.headers);
      if (document.documentElement.lang) headers.set('accept-language', document.documentElement.lang);
      return globalThis.fetch(input, { ...init, headers });
    },
  },
});

export type Session = typeof authClient.$Infer.Session;
