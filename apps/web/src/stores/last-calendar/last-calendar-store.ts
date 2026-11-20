// The calendar the last event was created in, so quick add and "New event" start there. Kept per
// browser (a convenience, not a setting); if storage is blocked it lasts until the page reloads.
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { persist } from 'zustand/middleware';

export type LastCalendarState = { id: string | undefined; remember: (id: string) => void };

export const useLastCalendar: UseBoundStore<StoreApi<LastCalendarState>> = create<LastCalendarState>()(
  persist(
    (set) => ({
      id: undefined,
      remember: (id: string): void => {
        set({ id });
      },
    }),
    { name: 'homa.lastCalendar', partialize: (s: LastCalendarState): Pick<LastCalendarState, 'id'> => ({ id: s.id }) },
  ),
);

/** The calendar new events go in: the last one used if it's still writable, else the first writable one. */
export const defaultCalendarId = (writableIds: readonly string[], lastId: string | undefined): string | undefined =>
  lastId && writableIds.includes(lastId) ? lastId : writableIds[0];
