// The router, built from the generated file-based route tree.
import type { QueryClient } from '@tanstack/react-query';
import { createRouter, type ErrorComponentProps, type RouterHistory } from '@tanstack/react-router';
import type { JSX } from 'react';
import { NotFoundPage, RuntimeErrorPage } from '@/pages/errors';
import { routeTree } from '@/routeTree.gen';

function RouterRuntimeError({ error, reset }: ErrorComponentProps): JSX.Element {
  return <RuntimeErrorPage error={error} onRetry={reset} />;
}

// biome-ignore lint/nursery/useExplicitType: the router's type is inferred from the route tree; the Register declaration below needs exactly that type.
export const createAppRouter = (queryClient: QueryClient, history?: RouterHistory) =>
  createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    history,
    defaultErrorComponent: RouterRuntimeError,
    defaultNotFoundComponent: NotFoundPage,
  });

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
