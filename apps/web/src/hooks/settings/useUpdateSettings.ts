import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { homaClient, unwrap } from '@/api';
import { type Settings, SettingsSchema } from '@/schemas';
import { settingsQuery } from './settings-query';

/** Saves a settings change and puts the result in the cache. */
export function useUpdateSettings(): UseMutationResult<Settings, Error, Partial<Settings>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Settings>): Promise<Settings> =>
      SettingsSchema.parse(await unwrap(homaClient.PATCH('/settings', { body: patch }))),
    onSuccess: (s: Settings): void => {
      qc.setQueryData(settingsQuery.queryKey, s);
    },
  });
}
