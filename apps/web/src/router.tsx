import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router';
import { CalendarPage } from './calendar/CalendarPage';
import { VIEWS, type View } from './calendar/dates';
import { AppLayout } from './routes/AppLayout';
import { AuthForm } from './routes/AuthForm';
import { Onboarding } from './routes/Onboarding';
import { sessionQuery } from './session';

const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet });

// Signed-out pages: send signed-in people to the calendar.
const publicOnly = async ({ context }: { context: { queryClient: QueryClient } }) => {
  if (await context.queryClient.ensureQueryData(sessionQuery)) throw redirect({ to: '/' });
};

const signIn = createRoute({
  getParentRoute: () => root,
  path: '/sign-in',
  beforeLoad: publicOnly,
  component: () => <AuthForm mode="sign-in" />,
});
const signUp = createRoute({
  getParentRoute: () => root,
  path: '/sign-up',
  beforeLoad: publicOnly,
  component: () => <AuthForm mode="sign-up" />,
});

const app = createRoute({
  getParentRoute: () => root,
  id: 'app',
  beforeLoad: async ({ context }) => {
    if (!(await context.queryClient.ensureQueryData(sessionQuery))) throw redirect({ to: '/sign-in' });
  },
  component: AppLayout,
});
const calendar = createRoute({
  getParentRoute: () => app,
  path: '/',
  validateSearch: (s: Record<string, unknown>): { view?: View; date?: string } => ({
    view: VIEWS.includes(s.view as View) ? (s.view as View) : undefined,
    date: typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : undefined,
  }),
  component: CalendarPage,
});
const onboarding = createRoute({ getParentRoute: () => app, path: '/onboarding', component: Onboarding });

const routeTree = root.addChildren([signIn, signUp, app.addChildren([calendar, onboarding])]);

export function makeRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent' });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}
