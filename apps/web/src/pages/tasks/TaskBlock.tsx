import { Alert, Button, Group, NativeSelect, Stack, Text, TextInput } from '@mantine/core';
import { type ChangeEvent, type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendars } from '@/hooks/calendar';
import { useCalendarLocale, useDateFormats } from '@/hooks/locale';
import { useTaskMutations } from '@/hooks/tasks';
import type { Task } from '@/schemas';
import { isoDate } from '@/services/dates';
import { instantOf, wallOf } from '@/services/zones';
import { defaultCalendarId, useAnnouncer, useLastCalendar } from '@/stores';
import { useTasksPageModel } from './model';

const LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240] as const;
const MINUTE = 60_000;
const HOUR = 3_600_000;

const hhmm = (d: Date): string => d.toISOString().slice(11, 16);

/** The task's time block: an event on the calendar for working on it. Block, move or remove it. */
export function TaskBlock({ task }: { task: Task }): JSX.Element {
  const { t } = useTranslation();
  const m = useTasksPageModel();
  const formats = useDateFormats(useCalendarLocale());
  const calendars = useCalendars();
  const lastId = useLastCalendar((s) => s.id);
  const { schedule, unschedule } = useTaskMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [error, setError] = useState<string>();
  const writable = (calendars.data ?? []).filter((c) => !c.readOnly);
  const block = task.block;
  // The form starts at the block, else at the due time, else the next whole hour today.
  const start = block
    ? wallOf(new Date(block.start), m.tz)
    : task.dueDate && task.dueTime
      ? new Date(`${task.dueDate}T${task.dueTime}:00Z`)
      : wallOf(new Date(Math.ceil(Date.now() / HOUR) * HOUR), m.tz);
  const minutes = block ? Math.round((Date.parse(block.end) - Date.parse(block.start)) / MINUTE) : 60;
  const [date, setDate] = useState(isoDate(start));
  const [time, setTime] = useState(hhmm(start));
  const [length, setLength] = useState(String(minutes));
  const [picked, setCalendarId] = useState<string>();
  // Until one is picked: the block's calendar, else where events were last made (calendars load late).
  const calendarId =
    picked ??
    block?.calendarId ??
    defaultCalendarId(
      writable.map((c) => c.id),
      lastId,
    ) ??
    '';
  const fail = (err: Error): void => setError(err.message);

  const save = (): void => {
    const from = instantOf(new Date(`${date}T${time}:00Z`), m.tz);
    schedule.mutate(
      {
        id: task.id,
        calendarId,
        start: from.toISOString(),
        end: new Date(from.getTime() + Number(length) * MINUTE).toISOString(),
      },
      { onSuccess: () => announce(t('tasks.blockSaved')), onError: fail },
    );
  };
  const remove = (): void =>
    unschedule.mutate(task.id, { onSuccess: () => announce(t('tasks.blockRemoved')), onError: fail });

  const blockWhen = (b: NonNullable<Task['block']>): string => {
    const s = wallOf(new Date(b.start), m.tz);
    const e = wallOf(new Date(b.end), m.tz);
    return t('tasks.dayTime', { day: m.labels.day(isoDate(s)), time: formats.time.formatRange(s, e) });
  };
  const calendarName = (id: string): string => calendars.data?.find((c) => c.id === id)?.name ?? '';

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>
        {t('tasks.block')}
      </Text>
      <Text size="xs" c="dimmed">
        {t('tasks.blockHint')}
      </Text>
      {error && (
        <Alert color="red" role="alert">
          {t('tasks.blockFailed', { message: error })}
        </Alert>
      )}
      {block && (
        <Text size="sm">
          {t('tasks.blockAt', { when: blockWhen(block), calendar: calendarName(block.calendarId) })}
        </Text>
      )}
      {writable.length === 0 && calendars.isSuccess ? (
        <Text size="sm">{t('tasks.noCalendars')}</Text>
      ) : (
        <>
          <Group grow align="flex-end">
            <TextInput
              type="date"
              label={t('tasks.blockDate')}
              value={date}
              onChange={(e: ChangeEvent<HTMLInputElement>): void => setDate(e.currentTarget.value)}
            />
            <TextInput
              type="time"
              label={t('tasks.blockStart')}
              value={time}
              onChange={(e: ChangeEvent<HTMLInputElement>): void => setTime(e.currentTarget.value)}
            />
          </Group>
          <Group grow align="flex-end">
            <NativeSelect
              label={t('tasks.blockLength')}
              value={length}
              onChange={(e: ChangeEvent<HTMLSelectElement>): void => setLength(e.currentTarget.value)}
              data={LENGTHS.map((n) => ({ value: String(n), label: t('tasks.length', { count: n }) }))}
            />
            <NativeSelect
              label={t('tasks.blockCalendar')}
              value={calendarId}
              onChange={(e: ChangeEvent<HTMLSelectElement>): void => setCalendarId(e.currentTarget.value)}
              data={writable.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Group>
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              onClick={save}
              loading={schedule.isPending}
              disabled={!date || !time || !calendarId}
            >
              {block ? t('tasks.blockMove') : t('tasks.blockAdd')}
            </Button>
            {block && (
              <Button size="xs" variant="subtle" color="red" onClick={remove} loading={unschedule.isPending}>
                {t('tasks.blockRemove')}
              </Button>
            )}
          </Group>
        </>
      )}
    </Stack>
  );
}
