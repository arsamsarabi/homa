// Route guards: signed-out pages send signed-in people to the calendar, and the app sends
// signed-out people to sign in.
import type { QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';
import { sessionQuery } from '@/hooks/session';

export type RouterContext = { queryClient: QueryClient };
type GuardArgs = { context: RouterContext };

export async function requireSignedOut({ context }: GuardArgs): Promise<void> {
  if (await context.queryClient.ensureQueryData(sessionQuery)) throw redirect({ to: '/' });
}

export async function requireSignedIn({ context }: GuardArgs): Promise<void> {
  if (!(await context.queryClient.ensureQueryData(sessionQuery))) throw redirect({ to: '/sign-in' });
}
