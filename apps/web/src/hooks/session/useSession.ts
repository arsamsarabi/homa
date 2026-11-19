import { type UseSuspenseQueryResult, useSuspenseQuery } from '@tanstack/react-query';
import type { Session } from '@/api';
import { sessionQuery } from './session-query';

/** The current session. Suspends until it's loaded; the route guards make sure it is. */
export const useSession = (): UseSuspenseQueryResult<Session | null> => useSuspenseQuery(sessionQuery);
