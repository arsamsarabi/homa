// Editing settings in a form: a local copy of the saved settings, and saving it.
import { useState } from 'react';
import type { Settings } from '@/schemas';
import { useSettings } from './useSettings';
import { useUpdateSettings } from './useUpdateSettings';

export type SettingsDraft = {
  value: Settings;
  change: (patch: Partial<Settings>) => void;
  save: () => Promise<void>;
  busy: boolean;
  error: string | undefined;
};

const DEFAULTS: Settings = { homeTz: null, secondaryCalendar: 'none' };

export function useSettingsDraft(): SettingsDraft {
  const saved = useSettings().data ?? DEFAULTS;
  const update = useUpdateSettings();
  const [edits, setEdits] = useState<Partial<Settings>>({});
  return {
    value: { ...saved, ...edits },
    change: (patch: Partial<Settings>): void => setEdits((e) => ({ ...e, ...patch })),
    save: async (): Promise<void> => {
      await update.mutateAsync(edits);
      setEdits({});
    },
    busy: update.isPending,
    error: update.error?.message,
  };
}
