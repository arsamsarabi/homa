// The signed-in user's settings, parsed with the schema in @/schemas.
import { queryOptions } from '@tanstack/react-query';
import { homaClient, unwrap } from '@/api';
import { type Settings, SettingsSchema } from '@/schemas';

export const settingsQuery = queryOptions({
  queryKey: ['settings'],
  queryFn: async (): Promise<Settings> => SettingsSchema.parse(await unwrap(homaClient.GET('/settings'))),
  staleTime: Number.POSITIVE_INFINITY,
});
