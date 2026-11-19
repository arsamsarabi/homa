// Editing the instance's settings in a form: a local copy of the saved ones, and saving it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { homaClient, unwrap } from '@/api';
import { type InstanceSettings, InstanceSettingsSchema } from '@/schemas';
import { instanceQuery } from './instance-query';
import { instanceSettingsQuery } from './instance-settings-query';

export type InstanceSettingsDraft =
  | { status: 'pending' }
  | { status: 'error'; error: Error; retry: () => void }
  | {
      status: 'success';
      value: InstanceSettings;
      change: (patch: Partial<InstanceSettings>) => void;
      save: () => Promise<void>;
      busy: boolean;
      error: string | undefined;
    };

export function useInstanceSettingsDraft(): InstanceSettingsDraft {
  const qc = useQueryClient();
  const query = useQuery(instanceSettingsQuery);
  const [edits, setEdits] = useState<Partial<InstanceSettings>>({});
  const update = useMutation({
    mutationFn: async (patch: Partial<InstanceSettings>): Promise<InstanceSettings> =>
      InstanceSettingsSchema.parse(await unwrap(homaClient.PATCH('/admin/instance', { body: patch }))),
    onSuccess: async (s: InstanceSettings): Promise<void> => {
      qc.setQueryData(instanceSettingsQuery.queryKey, s);
      // The public view (name, sign-ups, default language) changes with these.
      await qc.invalidateQueries({ queryKey: instanceQuery.queryKey });
    },
  });

  if (query.isPending) return { status: 'pending' };
  if (query.isError) return { status: 'error', error: query.error, retry: (): void => void query.refetch() };
  return {
    status: 'success',
    value: { ...query.data, ...edits },
    change: (patch: Partial<InstanceSettings>): void => setEdits((e) => ({ ...e, ...patch })),
    save: async (): Promise<void> => {
      await update.mutateAsync(edits);
      setEdits({});
    },
    busy: update.isPending,
    error: update.error?.message,
  };
}
