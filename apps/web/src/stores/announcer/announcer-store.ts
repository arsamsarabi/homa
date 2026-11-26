// Messages for screen readers ("Event moved", "Couldn't save"), read out by the LiveRegion in the
// app layout. A counter makes the same message announce again. `toast: true` also shows a Mantine
// notification (success by default); quick-add previews stay polite-only.

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { NotifyKind } from '@/lib/notify';

export type AnnounceOptions = { toast?: boolean; kind?: NotifyKind };

export type AnnouncerState = {
  message: string;
  id: number;
  toast: boolean;
  kind: NotifyKind;
  announce: (message: string, options?: AnnounceOptions) => void;
};

export const useAnnouncer: UseBoundStore<StoreApi<AnnouncerState>> = create<AnnouncerState>()((set) => ({
  message: '',
  id: 0,
  toast: false,
  kind: 'success',
  announce: (message: string, options?: AnnounceOptions): void =>
    set((s) => ({
      message,
      id: s.id + 1,
      toast: options?.toast !== false,
      kind: options?.kind ?? 'success',
    })),
}));
