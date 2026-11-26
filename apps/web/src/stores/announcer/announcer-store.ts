// Messages for screen readers ("Event moved", "Couldn't save"), read out by the LiveRegion in the
// app layout. A counter makes the same message announce again. `toast: true` also shows the message
// briefly on screen (success / failure feedback); quick-add previews stay polite-only.
import { create, type StoreApi, type UseBoundStore } from 'zustand';

export type AnnounceOptions = { toast?: boolean };

export type AnnouncerState = {
  message: string;
  id: number;
  toast: boolean;
  announce: (message: string, options?: AnnounceOptions) => void;
};

export const useAnnouncer: UseBoundStore<StoreApi<AnnouncerState>> = create<AnnouncerState>()((set) => ({
  message: '',
  id: 0,
  toast: false,
  announce: (message: string, options?: AnnounceOptions): void =>
    set((s) => ({ message, id: s.id + 1, toast: options?.toast !== false })),
}));
