// Saving, moving and deleting from the calendar. Recurring events ask for the scope first; a time
// change to the whole series is re-based on the series' own start. The editor closes as soon as the
// write is accepted into the cache so the form and draft ghost do not linger.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventPatch } from '@/api';
import { useEventMutations } from '@/hooks/calendar';
import { useSetEventReminders } from '@/hooks/reminders';
import type { HomaEvent, Occurrence, Scope } from '@/schemas';
import type { EditorResult } from '@/services/event-form';
import { allowedScopes, seriesPatch, shiftsSeries } from '@/services/series-change';
import { useAnnouncer, useLastCalendar } from '@/stores';
import type { ScopePrompt } from './useScopePrompt';

export type OccurrenceActions = {
  save: (r: EditorResult) => Promise<void>;
  remove: (o: Occurrence) => Promise<void>;
  move: (o: Occurrence, start: Date, end: Date) => void;
  /** A failed drag move, shown above the calendar until dismissed. */
  error: string | undefined;
  clearError: () => void;
};

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function useOccurrenceActions(ask: ScopePrompt['ask'], closeEditor: () => void): OccurrenceActions {
  const { t } = useTranslation();
  const { create, update, remove: removeEvent, fetchSeries } = useEventMutations();
  const setReminders = useSetEventReminders();
  const announce = useAnnouncer((s) => s.announce);
  const rememberCalendar = useLastCalendar((s) => s.remember);
  const [error, setError] = useState<string>();

  /** Applies a patch to an occurrence; the changed event or series, or undefined if the scope question was cancelled. */
  async function change(o: Occurrence, patch: EventPatch, seriesChanged = false): Promise<HomaEvent | undefined> {
    let scope: Scope = 'all';
    if (o.recurring) {
      const picked = await ask('change', allowedScopes(seriesChanged));
      if (!picked) return undefined;
      scope = picked;
    }
    const body = shiftsSeries(o, scope, patch) ? seriesPatch(o, patch, (await fetchSeries(o.eventId)).start) : patch;
    return update.mutateAsync({
      id: o.eventId,
      patch: body,
      scope,
      recurrenceId: o.recurring ? o.recurrenceId : undefined,
    });
  }

  async function save(r: EditorResult): Promise<void> {
    try {
      if (r.kind === 'create') {
        closeEditor();
        await create.mutateAsync(r.body);
        rememberCalendar(r.body.calendarId);
      } else {
        const changed = await change(r.occurrence, r.patch, r.seriesChanged);
        if (!changed) return;
        closeEditor();
        // Reminders belong to the series: "this and following" changes the new series' ones.
        if (r.reminders) await setReminders.mutateAsync({ id: changed.id, reminders: r.reminders });
      }
      announce(t('calendar.announce.saved'));
    } catch (err: unknown) {
      // Toast always; rethrow so quick-add can keep the line and callers can react.
      announce(t('calendar.saveFailed', { message: messageOf(err) }), { kind: 'error' });
      throw err;
    }
  }

  async function remove(o: Occurrence): Promise<void> {
    let scope: Scope = 'all';
    if (o.recurring) {
      const picked = await ask('delete', allowedScopes(false));
      if (!picked) return;
      scope = picked;
    }
    // Close before the network round-trip so the form and Draft ghost clear at once.
    closeEditor();
    try {
      await removeEvent.mutateAsync({
        id: o.eventId,
        scope,
        recurrenceId: o.recurring ? o.recurrenceId : undefined,
      });
      announce(t('calendar.announce.deleted'));
    } catch (err: unknown) {
      announce(t('calendar.deleteFailed', { message: messageOf(err) }), { kind: 'error' });
      throw err;
    }
  }

  function move(o: Occurrence, start: Date, end: Date): void {
    setError(undefined);
    change(o, { start: start.toISOString(), end: end.toISOString() })
      .then((done) => {
        if (done) announce(t('calendar.announce.moved'));
      })
      .catch((err: unknown) => {
        // Inline banner above the calendar owns failure feedback; do not also toast.
        setError(messageOf(err));
      });
  }

  return { save, remove, move, error, clearError: (): void => setError(undefined) };
}
