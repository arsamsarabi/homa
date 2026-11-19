// Renders the whole app at a URL with the API faked at the fetch boundary.
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { type RenderResult, render } from '@testing-library/react';
import '@/lib/i18n';
import { createAppRouter } from '@/lib/router';
import { theme } from '@/styles';

export type FakeApi = (url: URL, req: Request) => Response | Promise<Response>;

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const signedIn: FakeApi = (url) =>
  url.pathname === '/api/auth/get-session'
    ? json({
        user: {
          id: 'u1',
          name: 'Ada',
          email: 'ada@example.com',
          emailVerified: false,
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
      })
    : json({ error: `unexpected ${url.pathname}` }, 404);

export function renderApp(path: string, api: FakeApi): RenderResult {
  const fake = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input instanceof URL ? input.href : input, init);
    return api(new URL(req.url, 'http://localhost:3000'), req);
  }) as typeof fetch;
  globalThis.fetch = fake;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  return render(
    <MantineProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}
