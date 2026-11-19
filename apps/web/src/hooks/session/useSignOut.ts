import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { authClient } from '@/api';
import { sessionQuery } from './session-query';

/** Signs out, forgets the cached session and goes to the sign-in page. */
export function useSignOut(): () => Promise<void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async (): Promise<void> => {
    await authClient.signOut();
    queryClient.setQueryData(sessionQuery.queryKey, null);
    await navigate({ to: '/sign-in' });
  };
}
