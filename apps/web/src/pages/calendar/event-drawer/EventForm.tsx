import { Alert, Button, Group, Select, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import type { ChangeEvent, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { Draft, Repeat } from '@/services/event-form';
import { useEventForm } from './useEventForm';

/** Title, calendar, all-day, times, repeat, location and notes. */
export function EventForm({ draft }: { draft: Draft }): JSX.Element {
  const { t } = useTranslation();
  const f = useEventForm(draft);
  const input = f.allDay ? 'date' : 'datetime-local';

  return (
    <form onSubmit={f.submit}>
      <Stack>
        <TextInput
          name="summary"
          label={t('editor.title')}
          placeholder={t('editor.titlePlaceholder')}
          defaultValue={f.occurrence?.summary ?? ''}
          data-autofocus
        />
        {f.error && (
          <Alert color="red" role="alert">
            {f.error}
          </Alert>
        )}
        <Switch
          label={t('editor.allDay')}
          checked={f.allDay}
          onChange={(e: ChangeEvent<HTMLInputElement>): void => f.setAllDay(e.currentTarget.checked)}
        />
        <Group grow>
          <TextInput
            key={`s${f.allDay}`}
            name="start"
            type={input}
            label={t('editor.start')}
            defaultValue={f.times.start}
            required
          />
          <TextInput
            key={`e${f.allDay}`}
            name="end"
            type={input}
            label={t('editor.end')}
            defaultValue={f.times.end}
            required
          />
        </Group>
        {!f.allDay && (
          <Select
            label={t('editor.timeZone')}
            data={f.zones}
            value={f.tz}
            onChange={(v: string | null): void => {
              if (v) f.setTz(v);
            }}
            searchable
            allowDeselect={false}
            limit={50}
          />
        )}
        <Select
          label={t('editor.calendar')}
          data={f.calendarOptions}
          value={f.calendarId}
          onChange={(v: string | null): void => {
            if (v) f.setCalendarId(v);
          }}
          allowDeselect={false}
        />
        <Select
          label={t('editor.repeat')}
          data={f.repeatOptions}
          value={f.repeat}
          onChange={(v: string | null): void => {
            if (v) f.setRepeat(v as Repeat);
          }}
          allowDeselect={false}
          disabled={f.repeatLoading}
        />
        <TextInput name="location" label={t('editor.location')} defaultValue={f.occurrence?.location ?? ''} />
        <Textarea
          name="description"
          label={t('editor.description')}
          defaultValue={f.occurrence?.description ?? ''}
          autosize
          minRows={2}
        />
        <Group justify="space-between">
          <div>
            {f.occurrence && (
              <Button color="red" variant="subtle" onClick={f.remove} disabled={f.busy}>
                {t('editor.delete')}
              </Button>
            )}
          </div>
          <Group>
            <Button variant="default" onClick={f.close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={f.busy}>
              {t('editor.save')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}
