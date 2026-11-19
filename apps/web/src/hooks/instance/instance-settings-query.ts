// The instance's settings, which only an admin can read.
import { queryOptions } from '@tanstack/react-query';
import { homaClient, unwrap } from '@/api';
import { type InstanceSettings, InstanceSettingsSchema } from '@/schemas';

export const instanceSettingsQuery = queryOptions({
  queryKey: ['admin', 'instance'],
  queryFn: async (): Promise<InstanceSettings> =>
    InstanceSettingsSchema.parse(await unwrap(homaClient.GET('/admin/instance'))),
  staleTime: Number.POSITIVE_INFINITY,
});
