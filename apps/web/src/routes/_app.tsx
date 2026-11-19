import { createFileRoute } from '@tanstack/react-router';
import { settingsQuery } from '@/hooks/settings';
import { type RouterContext, requireSignedIn } from '@/lib/router';
import { AppLayout } from '@/pages/app-layout';

export const Route = createFileRoute('/_app')({
  beforeLoad: requireSignedIn,
  // Settings decide the zone the calendar is shown in, so load them before any page renders.
  loader: ({ context }: { context: RouterContext }): Promise<unknown> =>
    context.queryClient.ensureQueryData(settingsQuery),
  component: AppLayout,
});
