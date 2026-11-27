// Editing settings in a form: a local copy of the saved settings, and saving it.
import { useState } from 'react';
import type { Settings } from '@/schemas';
import { useSettings } from './useSettings';
import { useUpdateSettings } from './useUpdateSettings';

export type SettingsDraft = {
  value: Settings;
  change: (patch: Partial<Settings>) => void;
  /** Saves pending edits, optionally merged with a last-moment patch (e.g. onboarding visibility). */
  save: (extra?: Partial<Settings>) => Promise<void>;
  busy: boolean;
  error: string | undefined;
};

const DEFAULTS: Settings = {
  homeTz: null,
  secondaryCalendar: 'none',
  weekStart: null,
  sharingPreset: 'private',
  showShortcutHints: true,
};

export function useSettingsDraft(): SettingsDraft {
  const saved = useSettings().data ?? DEFAULTS;
  const update = useUpdateSettings();
  const [edits, setEdits] = useState<Partial<Settings>>({});
  return {
    value: { ...saved, ...edits },
    change: (patch: Partial<Settings>): void => setEdits((e) => ({ ...e, ...patch })),
    save: async (extra?: Partial<Settings>): Promise<void> => {
      const body = { ...edits, ...extra };
      await update.mutateAsync(body);
      setEdits({});
    },
    busy: update.isPending,
    error: update.error?.message,
  };
}
