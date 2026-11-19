// The router, built from the generated file-based route tree.
import type { QueryClient } from '@tanstack/react-query';
import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';

// biome-ignore lint/nursery/useExplicitType: the router's type is inferred from the route tree; the Register declaration below needs exactly that type.
export const createAppRouter = (queryClient: QueryClient, history?: RouterHistory) =>
  createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent', history });

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
