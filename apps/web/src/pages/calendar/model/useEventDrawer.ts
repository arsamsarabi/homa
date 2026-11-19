import { useState } from 'react';
import type { Occurrence } from '@/schemas';
import type { Draft } from '@/services/event-form';

export type EventDrawerState = {
  draft: Draft | undefined;
  openCreate: (start: Date, end: Date, allDay: boolean) => void;
  openEdit: (o: Occurrence) => void;
  close: () => void;
};

/** Which event the drawer is open for, if any. */
export function useEventDrawer(): EventDrawerState {
  const [draft, setDraft] = useState<Draft>();
  return {
    draft,
    openCreate: (start: Date, end: Date, allDay: boolean): void => setDraft({ kind: 'create', start, end, allDay }),
    openEdit: (occurrence: Occurrence): void => setDraft({ kind: 'edit', occurrence }),
    close: (): void => setDraft(undefined),
  };
}
