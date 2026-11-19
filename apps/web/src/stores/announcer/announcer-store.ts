// Messages for screen readers ("Event moved", "Couldn't save"), read out by the LiveRegion in the
// app layout. A counter makes the same message announce again.
import { create, type StoreApi, type UseBoundStore } from 'zustand';

export type AnnouncerState = { message: string; id: number; announce: (message: string) => void };

export const useAnnouncer: UseBoundStore<StoreApi<AnnouncerState>> = create<AnnouncerState>()((set) => ({
  message: '',
  id: 0,
  announce: (message: string): void => set((s) => ({ message, id: s.id + 1 })),
}));
