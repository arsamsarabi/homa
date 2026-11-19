// Better Auth's browser client for sign-up, sign-in, sign-out and the session.
import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  basePath: '/api/auth',
  // Types the admin plugin's fields on the session (user.role).
  plugins: [adminClient()],
  // Look fetch up per request (not once at import) so tests can fake the network.
  fetchOptions: {
    customFetchImpl: (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
      globalThis.fetch(input, init),
  },
});

export type Session = typeof authClient.$Infer.Session;
