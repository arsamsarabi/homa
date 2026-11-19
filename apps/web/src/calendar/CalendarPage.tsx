// The calendar: toolbar, the five views, the editor and the "which occurrences?" question.
import { ActionIcon, Button, Group, SegmentedControl, Title } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AgendaView } from './AgendaView';
import {
  type EventPatch,
  getEvent,
  type Occurrence,
  type Scope,
  useCalendars,
  useEventMutations,
  useOccurrences,
} from './api';
import { addDays, isoDate, parseIsoDate, rangeFor, step, VIEWS, type View } from './dates';
import { type Draft, type EditorResult, EventEditor } from './EventEditor';
import { MonthView } from './MonthView';
import { useScopeDialog } from './ScopeDialog';
import { TimeGrid } from './TimeGrid';
import { YearView } from './YearView';
import './calendar.css';

export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const search = useSearch({ from: '/app/' });
  const navigate = useNavigate({ from: '/' });
  const view = search.view ?? 'week';
  const date = parseIsoDate(search.date);
  // shortcut: Gregorian only; the Solar Hijri calendar and a home time zone come in phase 2c.
  const locale = i18n.language === 'fa' ? 'fa-IR-u-ca-gregory' : 'en-GB';
  const weekStart = i18n.language === 'fa' ? 6 : 1;
  const range = rangeFor(view, date, weekStart);

  const calendars = useCalendars();
  const occurrences = useOccurrences(range.from, range.to);
  const { create, update, remove } = useEventMutations();
  const { ask, dialog } = useScopeDialog();
  const [draft, setDraft] = useState<Draft>();

  const colors = Object.fromEntries((calendars.data ?? []).map((c) => [c.id, c.color]));
  const occ = occurrences.data ?? [];
  const go = (next: { view?: View; date?: Date }) =>
    navigate({ search: { view: next.view ?? view, date: isoDate(next.date ?? date) } });

  /**
   * Applies a change to one occurrence. Recurring events ask for the scope first; for the whole
   * series the occurrence's shift in time is applied to the series' own start.
   */
  async function change(o: Occurrence, patch: EventPatch, seriesChanged = false) {
    let scope: Scope = 'all';
    if (o.recurring) {
      const s = await ask('change', seriesChanged ? ['following', 'all'] : undefined);
      if (!s) return;
      scope = s;
    }
    if (scope === 'all' && o.recurring && (patch.start || patch.end)) {
      const master = await getEvent(o.eventId);
      const s = new Date(patch.start ?? o.start).getTime();
      const shift = s - new Date(o.start).getTime();
      const length = new Date(patch.end ?? o.end).getTime() - s;
      const start = new Date(new Date(master.start).getTime() + shift);
      patch = { ...patch, start: start.toISOString(), end: new Date(start.getTime() + length).toISOString() };
    }
    await update.mutateAsync({ id: o.eventId, patch, scope, recurrenceId: o.recurring ? o.recurrenceId : undefined });
  }

  async function save(r: EditorResult) {
    if (r.kind === 'create') await create.mutateAsync(r.body);
    else await change(r.occurrence, r.patch, r.seriesChanged);
    setDraft(undefined);
  }

  async function del(o: Occurrence) {
    let scope: Scope = 'all';
    if (o.recurring) {
      const s = await ask('delete');
      if (!s) return;
      scope = s;
    }
    await remove.mutateAsync({ id: o.eventId, scope, recurrenceId: o.recurring ? o.recurrenceId : undefined });
    setDraft(undefined);
  }

  const shared = {
    occurrences: occ,
    colors,
    locale,
    onOpen: (o: Occurrence) => setDraft({ kind: 'edit', occurrence: o }),
    onCreate: (start: Date, end: Date, allDay: boolean) => setDraft({ kind: 'create', start, end, allDay }),
    onMove: (o: Occurrence, start: Date, end: Date) =>
      void change(o, { start: start.toISOString(), end: end.toISOString() }),
    onPickDay: (d: Date) => go({ view: 'day', date: d }),
  };

  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, o);
  const title = {
    day: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date),
    week: fmt({ month: 'long', year: 'numeric' }).format(range.from),
    month: fmt({ month: 'long', year: 'numeric' }).format(date),
    year: String(fmt({ year: 'numeric' }).format(date)),
    agenda: fmt({ day: 'numeric', month: 'short' }).formatRange(range.from, addDays(range.to, -1)),
  }[view];

  return (
    <div className="cal">
      <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
        <Group gap="xs">
          <Button variant="default" onClick={() => go({ date: new Date() })}>
            {t('calendar.today')}
          </Button>
          <ActionIcon
            variant="subtle"
            size="lg"
            onClick={() => go({ date: step(view, date, -1) })}
            aria-label={t('calendar.previous')}
          >
            <IconChevronLeft size={18} className="flip-rtl" />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            size="lg"
            onClick={() => go({ date: step(view, date, 1) })}
            aria-label={t('calendar.next')}
          >
            <IconChevronRight size={18} className="flip-rtl" />
          </ActionIcon>
          <Title order={2} size="h3">
            {title}
          </Title>
        </Group>
        <Group gap="xs">
          <SegmentedControl
            value={view}
            onChange={(v) => go({ view: v as View })}
            data={VIEWS.map((v) => ({ value: v, label: t(`calendar.views.${v}`) }))}
          />
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              const s = new Date(date);
              const now = new Date();
              s.setHours(now.getHours() + 1, 0, 0, 0);
              shared.onCreate(s, new Date(s.getTime() + 3_600_000), false);
            }}
          >
            {t('calendar.newEvent')}
          </Button>
        </Group>
      </Group>

      {(view === 'day' || view === 'week') && <TimeGrid days={range.days} {...shared} />}
      {view === 'month' && <MonthView month={date} days={range.days} {...shared} />}
      {view === 'year' && (
        <YearView
          year={date.getFullYear()}
          occurrences={occ}
          locale={locale}
          weekStart={weekStart}
          onPickDay={shared.onPickDay}
        />
      )}
      {view === 'agenda' && <AgendaView days={range.days} {...shared} />}

      <EventEditor
        draft={draft}
        calendars={calendars.data ?? []}
        onClose={() => setDraft(undefined)}
        onSave={save}
        onDelete={del}
      />
      {dialog}
    </div>
  );
}
