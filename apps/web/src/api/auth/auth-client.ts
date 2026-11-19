// Better Auth's browser client for sign-up, sign-in, sign-out and the session.
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  basePath: '/api/auth',
  // Look fetch up per request (not once at import) so tests can fake the network.
  fetchOptions: {
    customFetchImpl: (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
      globalThis.fetch(input, init),
  },
});

export type Session = typeof authClient.$Infer.Session;
