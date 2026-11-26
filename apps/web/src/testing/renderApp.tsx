// Renders the whole app at a URL with the API faked at the fetch boundary.
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { type RenderResult, render } from '@testing-library/react';
import '@/lib/i18n';
import { createAppRouter } from '@/lib/router';
import { theme } from '@/styles';

export type FakeApi = (url: URL, req: Request) => Response | Promise<Response>;

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** An instance that's set up, with sign-ups open; `/api/instance` answers this unless a fake overrides it. */
export const setUpInstance = {
  name: 'Homa',
  signUpsOpen: true,
  needsSetup: false,
  defaultLanguage: 'en' as const,
  googleCalendar: false,
  microsoftCalendar: false,
  passwordReset: false,
  anyoneCanInvite: false,
  demo: null,
};

/** Better Auth's get-session body for Ada, with `role` ('user' unless given). */
export const sessionBody = (role = 'user'): unknown => ({
  user: {
    id: 'u1',
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: false,
    role,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
  session: {
    id: 's1',
    userId: 'u1',
    token: 't',
    expiresAt: '2099-01-01T00:00:00Z',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
});

/** Signed in as Ada, with `settings` (default: the browser's zone, no second calendar). */
export const signedInWith =
  (settings: { homeTz: string | null; secondaryCalendar: string; weekStart?: number | null }, role = 'user'): FakeApi =>
  (url) =>
    url.pathname === '/api/settings'
      ? json(settings)
      : url.pathname === '/api/auth/get-session'
        ? json(sessionBody(role))
        : url.pathname === '/api/instance'
          ? json(setUpInstance)
          : url.pathname === '/api/notifications'
            ? json({ items: [], unread: 0 })
            : url.pathname === '/api/notification-channels'
              ? json({ items: [], email: false })
              : ['/api/people', '/api/circles', '/api/invites'].includes(url.pathname)
                ? json([])
                : json({ error: `unexpected ${url.pathname}` }, 404);

export const signedIn: FakeApi = signedInWith({ homeTz: null, secondaryCalendar: 'none' });

export function renderApp(path: string, api: FakeApi): RenderResult {
  notifications.clean();
  const fake = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input instanceof URL ? input.href : input, init);
    return api(new URL(req.url, 'http://localhost:3000'), req);
  }) as typeof fetch;
  globalThis.fetch = fake;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  return render(
    <MantineProvider theme={theme}>
      <Notifications position="bottom-right" />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}
