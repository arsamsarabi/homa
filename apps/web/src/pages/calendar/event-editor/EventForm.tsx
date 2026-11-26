import {
  ActionIcon,
  Alert,
  Button,
  CloseButton,
  ColorSwatch,
  Group,
  Menu,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { IconDots, IconTrash } from '@tabler/icons-react';
import type { ChangeEvent, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { ReminderChips } from '@/components';
import type { Draft, Repeat } from '@/services/event-form';
import classes from './EventEditor.module.css';
import { ReadOnlyDetails } from './ReadOnlyDetails';
import { useEventForm } from './useEventForm';

/** Header (calendar, type, more, close), an inline title, then times, repeat, location and notes. */
export function EventForm({ draft }: { draft: Draft }): JSX.Element {
  const { t } = useTranslation();
  const f = useEventForm(draft);
  const input = f.allDay ? 'date' : 'datetime-local';
  if (f.readOnly && f.occurrence) return <ReadOnlyDetails occurrence={f.occurrence} onClose={f.close} />;

  return (
    <form onSubmit={f.submit} onInput={f.markDirty}>
      <Stack gap="sm">
        <Group gap="xs" wrap="nowrap">
          <ColorSwatch color={f.color ?? 'var(--mantine-primary-color-filled)'} size={12} aria-hidden />
          <Select
            aria-label={t('editor.calendar')}
            data={f.calendarOptions}
            value={f.calendarId}
            onChange={(v: string | null): void => {
              if (v) f.setCalendarId(v);
            }}
            allowDeselect={false}
            variant="unstyled"
            size="xs"
            className={classes.calendar}
            comboboxProps={{ withinPortal: false }}
          />
          <Text size="xs" c="dimmed" className={classes.kind}>
            {t('editor.event')}
          </Text>
          {f.occurrence && (
            <Menu position="bottom-end" withinPortal={false}>
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" size="sm" aria-label={t('editor.more')}>
                  <IconDots size={16} aria-hidden />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} aria-hidden />}
                  onClick={f.remove}
                  disabled={f.busy}
                >
                  {t('editor.delete')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
          <CloseButton size="sm" onClick={f.close} aria-label={t('common.close')} />
        </Group>
        <TextInput
          name="summary"
          aria-label={t('editor.title')}
          placeholder={t('editor.titlePlaceholder')}
          defaultValue={f.summary}
          onChange={(e: ChangeEvent<HTMLInputElement>): void => f.setSummary(e.currentTarget.value)}
          variant="unstyled"
          size="lg"
          classNames={{ input: classes.title }}
          data-autofocus
        />
        {f.error && (
          <Alert color="red" role="alert">
            {f.error}
          </Alert>
        )}
        <Group grow>
          <TextInput
            key={`s${f.allDay}`}
            name="start"
            type={input}
            label={t('editor.start')}
            value={f.times.start}
            onChange={(e: ChangeEvent<HTMLInputElement>): void => f.setStart(e.currentTarget.value)}
            size="xs"
            required
          />
          <TextInput
            key={`e${f.allDay}`}
            name="end"
            type={input}
            label={t('editor.end')}
            value={f.times.end}
            onChange={(e: ChangeEvent<HTMLInputElement>): void => f.setEnd(e.currentTarget.value)}
            size="xs"
            required
          />
        </Group>
        <Switch
          label={t('editor.allDay')}
          size="xs"
          checked={f.allDay}
          onChange={(e: ChangeEvent<HTMLInputElement>): void => f.setAllDay(e.currentTarget.checked)}
        />
        {!f.allDay && (
          <Select
            label={t('editor.timeZone')}
            data={f.zones}
            value={f.tz}
            onChange={(v: string | null): void => {
              if (v) f.setTz(v);
            }}
            size="xs"
            searchable
            allowDeselect={false}
            limit={50}
            comboboxProps={{ withinPortal: false }}
          />
        )}
        <Select
          label={t('editor.repeat')}
          data={f.repeatOptions}
          value={f.repeat}
          onChange={(v: string | null): void => {
            if (v) f.setRepeat(v as Repeat);
          }}
          size="xs"
          allowDeselect={false}
          disabled={f.repeatLoading}
          comboboxProps={{ withinPortal: false }}
        />
        <ReminderChips value={f.reminders} onChange={f.setReminders} disabled={f.remindersLoading} />
        <TextInput name="location" label={t('editor.location')} size="xs" defaultValue={f.occurrence?.location ?? ''} />
        <Textarea
          name="description"
          label={t('editor.description')}
          size="xs"
          defaultValue={f.occurrence?.description ?? ''}
          autosize
          minRows={2}
          maxRows={6}
        />
        <Group justify="flex-end">
          <Button type="submit" size="xs" loading={f.busy}>
            {t('editor.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
