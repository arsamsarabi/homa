// Saving, moving and deleting from the calendar. Recurring events ask for the scope first; a time
// change to the whole series is re-based on the series' own start.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventPatch } from '@/api';
import { useEventMutations } from '@/hooks/calendar';
import type { Occurrence, Scope } from '@/schemas';
import type { EditorResult } from '@/services/event-form';
import { allowedScopes, seriesPatch, shiftsSeries } from '@/services/series-change';
import { useAnnouncer } from '@/stores';
import type { ScopePrompt } from './useScopePrompt';

export type OccurrenceActions = {
  save: (r: EditorResult) => Promise<void>;
  remove: (o: Occurrence) => Promise<void>;
  move: (o: Occurrence, start: Date, end: Date) => void;
  /** A failed drag move, shown above the calendar until dismissed. */
  error: string | undefined;
  clearError: () => void;
};

export function useOccurrenceActions(ask: ScopePrompt['ask'], closeDrawer: () => void): OccurrenceActions {
  const { t } = useTranslation();
  const { create, update, remove: removeEvent, fetchSeries } = useEventMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [error, setError] = useState<string>();

  /** Applies a patch to an occurrence; false if the scope question was cancelled. */
  async function change(o: Occurrence, patch: EventPatch, seriesChanged = false): Promise<boolean> {
    let scope: Scope = 'all';
    if (o.recurring) {
      const picked = await ask('change', allowedScopes(seriesChanged));
      if (!picked) return false;
      scope = picked;
    }
    const body = shiftsSeries(o, scope, patch) ? seriesPatch(o, patch, (await fetchSeries(o.eventId)).start) : patch;
    await update.mutateAsync({
      id: o.eventId,
      patch: body,
      scope,
      recurrenceId: o.recurring ? o.recurrenceId : undefined,
    });
    return true;
  }

  async function save(r: EditorResult): Promise<void> {
    if (r.kind === 'create') await create.mutateAsync(r.body);
    else if (!(await change(r.occurrence, r.patch, r.seriesChanged))) return;
    closeDrawer();
    announce(t('calendar.announce.saved'));
  }

  async function remove(o: Occurrence): Promise<void> {
    let scope: Scope = 'all';
    if (o.recurring) {
      const picked = await ask('delete', allowedScopes(false));
      if (!picked) return;
      scope = picked;
    }
    await removeEvent.mutateAsync({ id: o.eventId, scope, recurrenceId: o.recurring ? o.recurrenceId : undefined });
    closeDrawer();
    announce(t('calendar.announce.deleted'));
  }

  function move(o: Occurrence, start: Date, end: Date): void {
    setError(undefined);
    change(o, { start: start.toISOString(), end: end.toISOString() })
      .then((done) => done && announce(t('calendar.announce.moved')))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        announce(t('calendar.moveFailed', { message }));
      });
  }

  return { save, remove, move, error, clearError: (): void => setError(undefined) };
}
