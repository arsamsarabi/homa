// Create or edit an event. Editing an occurrence of a recurring event asks for the scope on save.
import { Alert, Button, Group, Modal, Select, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Calendar, type EventPatch, getEvent, type Occurrence } from './api';
import {
  addDays,
  isoDate,
  isoLocal,
  localSpan,
  parseIsoDate,
  type Repeat,
  repeatOf,
  rruleOf,
  utcMidnight,
} from './dates';

export type Draft =
  | { kind: 'create'; start: Date; end: Date; allDay: boolean }
  | { kind: 'edit'; occurrence: Occurrence };

export type EditorResult =
  | {
      kind: 'create';
      body: Required<Pick<EventPatch, 'calendarId' | 'summary' | 'start' | 'end' | 'allDay' | 'tz'>> & EventPatch;
    }
  | { kind: 'edit'; occurrence: Occurrence; patch: EventPatch; seriesChanged: boolean };

type Props = {
  draft: Draft | undefined;
  calendars: Calendar[];
  onClose: () => void;
  onSave: (r: EditorResult) => Promise<void>;
  onDelete: (o: Occurrence) => Promise<void>;
};

const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function EventEditor({ draft, calendars, onClose, onSave, onDelete }: Props) {
  return (
    <Modal opened={Boolean(draft)} onClose={onClose} size="lg" withCloseButton={false}>
      {draft && <EditorForm key={JSON.stringify(draft)} {...{ draft, calendars, onClose, onSave, onDelete }} />}
    </Modal>
  );
}

function EditorForm({ draft, calendars, onClose, onSave, onDelete }: Props & { draft: Draft }) {
  const { t } = useTranslation();
  const occ = draft.kind === 'edit' ? draft.occurrence : undefined;
  const series = useQuery({
    queryKey: ['event', occ?.eventId],
    queryFn: () => getEvent(occ?.eventId as string),
    enabled: Boolean(occ?.recurring),
  });

  const span = occ ? localSpan(occ) : { start: (draft as { start: Date }).start, end: (draft as { end: Date }).end };
  const startAllDay = occ ? occ.allDay : (draft as { allDay: boolean }).allDay;
  const [allDay, setAllDay] = useState(startAllDay);
  const [calendarId, setCalendarId] = useState(occ?.calendarId ?? calendars[0]?.id ?? '');
  const [repeat, setRepeat] = useState<Repeat | undefined>(occ ? undefined : 'none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const seriesRepeat = repeatOf(series.data?.rrule);
  const shownRepeat = repeat ?? (occ?.recurring ? seriesRepeat : 'none');

  // All-day end dates are inclusive in the form and exclusive in the API.
  const startValue = allDay ? isoDate(span.start) : isoLocal(span.start);
  const endValue = allDay
    ? isoDate(startAllDay ? addDays(span.end, -1) : span.end)
    : isoLocal(startAllDay ? new Date(span.start.getTime() + 3_600_000) : span.end);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? '');
    let start: Date;
    let end: Date;
    if (allDay) {
      start = utcMidnight(parseIsoDate(get('start')));
      end = utcMidnight(addDays(parseIsoDate(get('end')), 1));
    } else {
      start = new Date(get('start'));
      end = new Date(get('end'));
    }
    if (!(end > start)) return setError(t('editor.endBeforeStart'));
    const common = {
      summary: get('summary'),
      description: get('description') || null,
      location: get('location') || null,
      start: start.toISOString(),
      end: end.toISOString(),
    };
    setBusy(true);
    setError(undefined);
    try {
      if (!occ) {
        await onSave({
          kind: 'create',
          body: { ...common, calendarId, allDay, tz: allDay ? 'UTC' : browserTz(), rrule: rruleOf(shownRepeat, null) },
        });
      } else {
        const patch: EventPatch = { ...common };
        let seriesChanged = false;
        if (calendarId !== occ.calendarId) {
          patch.calendarId = calendarId;
          seriesChanged = true;
        }
        if (allDay !== occ.allDay) {
          patch.allDay = allDay;
          patch.tz = allDay ? 'UTC' : browserTz();
          seriesChanged = true;
        }
        if (repeat !== undefined && repeat !== seriesRepeat) {
          patch.rrule = rruleOf(repeat, series.data?.rrule ?? null);
          seriesChanged = true;
        }
        await onSave({ kind: 'edit', occurrence: occ, patch, seriesChanged });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const repeatOptions = (['none', 'daily', 'weekly', 'monthly', 'yearly'] as Repeat[])
    .concat(shownRepeat === 'custom' ? ['custom'] : [])
    .map((r) => ({ value: r, label: t(`repeat.${r}`) }));

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput
          name="summary"
          aria-label={t('editor.title')}
          placeholder={t('editor.titlePlaceholder')}
          defaultValue={occ?.summary ?? ''}
          size="lg"
          variant="unstyled"
          data-autofocus
        />
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        <Switch label={t('editor.allDay')} checked={allDay} onChange={(e) => setAllDay(e.currentTarget.checked)} />
        <Group grow>
          <TextInput
            key={`s${allDay}`}
            name="start"
            type={allDay ? 'date' : 'datetime-local'}
            label={t('editor.start')}
            defaultValue={startValue}
            required
          />
          <TextInput
            key={`e${allDay}`}
            name="end"
            type={allDay ? 'date' : 'datetime-local'}
            label={t('editor.end')}
            defaultValue={endValue}
            required
          />
        </Group>
        <Group grow>
          <Select
            label={t('editor.calendar')}
            data={calendars.map((c) => ({ value: c.id, label: c.name }))}
            value={calendarId}
            onChange={(v) => v && setCalendarId(v)}
            allowDeselect={false}
          />
          <Select
            label={t('editor.repeat')}
            data={repeatOptions}
            value={shownRepeat}
            onChange={(v) => v && setRepeat(v as Repeat)}
            allowDeselect={false}
            disabled={Boolean(occ?.recurring) && series.isPending}
          />
        </Group>
        <TextInput name="location" label={t('editor.location')} defaultValue={occ?.location ?? ''} />
        <Textarea
          name="description"
          label={t('editor.description')}
          defaultValue={occ?.description ?? ''}
          autosize
          minRows={2}
        />
        <Group justify="space-between">
          <div>
            {occ && (
              <Button
                color="red"
                variant="subtle"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onDelete(occ);
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t('editor.delete')}
              </Button>
            )}
          </div>
          <Group>
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={busy}>
              {t('editor.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}
