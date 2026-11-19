// Route guards: signed-out pages send signed-in people to the calendar, the app sends signed-out
// people to sign in, and a new instance sends everyone to set up its admin first.
import type { QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';
import { instanceQuery } from '@/hooks/instance';
import { sessionQuery } from '@/hooks/session';
import { applyDefaultLanguage } from '@/lib/i18n';

export type RouterContext = { queryClient: QueryClient };
type GuardArgs = { context: RouterContext };

/** Every page: switch to the instance's default language unless this browser chose one. */
export async function applyInstanceLanguage({ context }: GuardArgs): Promise<void> {
  try {
    applyDefaultLanguage((await context.queryClient.ensureQueryData(instanceQuery)).defaultLanguage);
  } catch (err: unknown) {
    // Not fatal: the page still works in the browser's language.
    console.error('could not load the instance', err);
  }
}

export async function requireSignedOut({ context }: GuardArgs): Promise<void> {
  if (await context.queryClient.ensureQueryData(sessionQuery)) throw redirect({ to: '/' });
  if ((await context.queryClient.ensureQueryData(instanceQuery)).needsSetup) throw redirect({ to: '/setup' });
}

/** The sign-up page, when the admin left sign-ups open. */
export async function requireSignUpsOpen(args: GuardArgs): Promise<void> {
  await requireSignedOut(args);
  if (!(await args.context.queryClient.ensureQueryData(instanceQuery)).signUpsOpen) throw redirect({ to: '/sign-in' });
}

export async function requireSignedIn({ context }: GuardArgs): Promise<void> {
  if (!(await context.queryClient.ensureQueryData(sessionQuery))) throw redirect({ to: '/sign-in' });
}

export async function requireAdmin({ context }: GuardArgs): Promise<void> {
  if ((await context.queryClient.ensureQueryData(sessionQuery))?.user.role !== 'admin') throw redirect({ to: '/' });
}

/** The setup journey: for a new instance, and for its admin while they finish the later steps. */
export async function requireSetup({ context }: GuardArgs): Promise<void> {
  if ((await context.queryClient.ensureQueryData(instanceQuery)).needsSetup) return;
  const session = await context.queryClient.ensureQueryData(sessionQuery);
  if (!session) throw redirect({ to: '/sign-in' });
  if (session.user.role !== 'admin') throw redirect({ to: '/' });
}
