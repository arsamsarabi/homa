import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendars, useCalendarUpdate } from '@/hooks/calendar';
import { useConnectionMutations, useConnections } from '@/hooks/connections';
import { useInstance } from '@/hooks/instance';
import { useOAuthReturn } from '@/pages/settings/connections';
import type { Calendar, Connection } from '@/schemas';
import { groupSharedByOwner, type SharedOwnerGroup } from '@/services/calendar-sharing';
import { useAnnouncer } from '@/stores';

/** Where a new calendar comes from, as picked in the Add calendar drawer. */
export type AddSource =
  | { kind: 'google' | 'microsoft' }
  | { kind: 'caldav'; preset: 'icloud' | 'fastmail' | 'nextcloud' | 'other' }
  | { kind: 'link' | 'holidays' };

/**
 * Settings → Calendars: the calendars grouped into cards (Homa's own, one per connection, one per
 * person sharing with you), the drawers that add, edit and remove them, and the actions on them.
 */
// biome-ignore lint/nursery/useExplicitType: the model's shape is inferred; CalendarsTabModel names it.
export function useCalendarsTab() {
  const { t, i18n } = useTranslation();
  const announce = useAnnouncer((s) => s.announce);
  const calendars = useCalendars();
  const connections = useConnections();
  const instance = useInstance().data;
  const update = useCalendarUpdate();
  const { syncNow, remove, dismissNotice, removeCalendar } = useConnectionMutations();
  const oauth = useOAuthReturn();

  const [picking, setPicking] = useState(false);
  const [subscribing, setSubscribing] = useState<'link' | 'holidays'>();
  // The account drawer: closed, connecting with a preset, or choosing an account's calendars (its id).
  const [caldav, setCaldav] = useState<{ preset?: string; connectionId?: string } | undefined>(
    oauth.connectedId ? { connectionId: oauth.connectedId } : undefined,
  );
  const [editing, setEditing] = useState<Calendar>();
  const [removing, setRemoving] = useState<Connection>();
  const [removingCalendar, setRemovingCalendar] = useState<Calendar>();

  const format = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language],
  );
  const all = calendars.data ?? [];
  const homa = useMemo((): Calendar[] => all.filter((c) => c.access === 'owner' && !c.connectionId), [all]);
  const shared = useMemo((): SharedOwnerGroup[] => groupSharedByOwner(all), [all]);
  // The calendars list is the source of truth for hidden and color (it updates optimistically).
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);
  const calendarsOf = (c: Connection): Calendar[] => c.calendars.map((cal) => byId.get(cal.id) ?? cal);

  const add = (source: AddSource): void => {
    setPicking(false);
    if (source.kind === 'google' || source.kind === 'microsoft')
      // A full page load: the API redirects to the provider's consent screen.
      window.location.assign(`/api/connections/${source.kind}/start`);
    else if (source.kind === 'caldav') setCaldav({ preset: source.preset });
    else setSubscribing(source.kind);
  };

  const recolor = (c: Calendar, color: string): void =>
    update.mutate({ id: c.id, color }, { onSuccess: () => announce(t('connections.calendarSaved')) });
  const toggle = (c: Calendar): void =>
    update.mutate(
      { id: c.id, hidden: !c.hidden },
      { onSuccess: () => announce(t(c.hidden ? 'calendars.shown' : 'calendars.hiddenDone', { name: c.name })) },
    );
  const sync = (id: string): void =>
    syncNow.mutate(id, {
      onSuccess: (c: Connection) =>
        announce(t(c.status === 'ok' ? 'connections.synced' : 'connections.syncFailed'), {
          kind: c.status === 'ok' ? 'success' : 'error',
        }),
    });
  const confirmRemove = (): void => {
    if (!removing) return;
    remove.mutate(removing.id, {
      onSuccess: () => announce(t('connections.removed')),
      onSettled: () => setRemoving(undefined),
    });
  };
  const confirmRemoveCalendar = (): void => {
    if (!removingCalendar) return;
    removeCalendar.mutate(removingCalendar.id, {
      onSuccess: () => announce(t('connections.removed')),
      onSettled: () => setRemovingCalendar(undefined),
    });
  };

  /** A failed action on this connection (sync or dismissing its notice), shown inside its card. */
  const errorFor = (connectionId: string): string | undefined => {
    if (syncNow.isError && syncNow.variables === connectionId) return syncNow.error.message;
    if (dismissNotice.isError && dismissNotice.variables === connectionId) return dismissNotice.error.message;
    return undefined;
  };
  /** A failed color or hide change, shown in the card holding that calendar. */
  const updateErrorFor = (ids: readonly string[]): string | undefined =>
    update.isError && ids.includes(update.variables.id) ? update.error.message : undefined;

  return {
    calendars,
    connections,
    homa,
    shared,
    calendarsOf,
    providers: { google: instance?.googleCalendar === true, microsoft: instance?.microsoftCalendar === true },
    oauth,
    picker: { opened: picking, open: (): void => setPicking(true), close: (): void => setPicking(false), add },
    subscribing: { mode: subscribing, close: (): void => setSubscribing(undefined) },
    caldav: {
      state: caldav,
      choose: (id: string): void => setCaldav({ connectionId: id }),
      close: (): void => setCaldav(undefined),
    },
    editing: { calendar: editing, open: setEditing, close: (): void => setEditing(undefined) },
    removing: {
      connection: removing,
      open: setRemoving,
      close: (): void => setRemoving(undefined),
      confirm: confirmRemove,
      busy: remove.isPending,
      error: remove.error?.message,
    },
    removingCalendar: {
      calendar: removingCalendar,
      open: setRemovingCalendar,
      close: (): void => setRemovingCalendar(undefined),
      confirm: confirmRemoveCalendar,
      busy: removeCalendar.isPending,
      error: removeCalendar.error?.message,
    },
    formatTime: (iso: string): string => format.format(new Date(iso)),
    recolor,
    toggle,
    sync,
    syncingId: syncNow.isPending ? syncNow.variables : undefined,
    dismissNotice: (id: string): void => dismissNotice.mutate(id),
    errorFor,
    updateErrorFor,
  };
}

export type CalendarsTabModel = ReturnType<typeof useCalendarsTab>;
