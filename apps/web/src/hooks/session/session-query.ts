// The signed-in session, cached for a minute. Route guards read it before a page loads.
import { queryOptions } from '@tanstack/react-query';
import { authClient, type Session } from '@/api';

export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: async (): Promise<Session | null> => (await authClient.getSession()).data ?? null,
  staleTime: 60_000,
});
