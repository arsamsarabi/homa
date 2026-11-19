// The instance's public face (name, sign-ups, whether it needs its admin). Route guards read it.
import { queryOptions } from '@tanstack/react-query';
import { homaClient, unwrap } from '@/api';
import { type PublicInstance, PublicInstanceSchema } from '@/schemas';

export const instanceQuery = queryOptions({
  queryKey: ['instance'],
  queryFn: async (): Promise<PublicInstance> => PublicInstanceSchema.parse(await unwrap(homaClient.GET('/instance'))),
  staleTime: 60_000,
});
