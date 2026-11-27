import { CloseButton, ColorSwatch, Group, Stack, Text, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { ReminderChips } from '@/components';
import { useSeries } from '@/hooks/calendar';
import { useSetEventReminders } from '@/hooks/reminders';
import { useAddedBy, useCalendarPageModel } from '@/pages/calendar/model';
import type { Occurrence } from '@/schemas';
import { wallOf } from '@/services/zones';
import { useAnnouncer } from '@/stores';
import classes from './EventEditor.module.css';

export type ReadOnlyDetailsProps = { occurrence: Occurrence; onClose: () => void };

/**
 * An event from a read-only calendar: a subscription (reminders stay in Homa) or one shared at
 * read (owner name shown; reminders are not editable — they stay with the owner).
 */
export function ReadOnlyDetails({ occurrence: o, onClose }: ReadOnlyDetailsProps): JSX.Element {
  const { t } = useTranslation();
  const event = useSeries(o.eventId);
  const setReminders = useSetEventReminders();
  const announce = useAnnouncer((s) => s.announce);
  const { calendarById, colors, formats, tz } = useCalendarPageModel();
  const calendar = calendarById[o.calendarId];
  const shared = calendar !== undefined && calendar.access !== 'owner';
  const addedBy = useAddedBy(o);
  // All-day events are stored at UTC midnights, which are already wall dates; the end is exclusive.
  const start = o.allDay ? new Date(o.start) : wallOf(new Date(o.start), tz);
  const end = o.allDay ? new Date(new Date(o.end).getTime() - 1) : wallOf(new Date(o.end), tz);
  const day = formats.fullDate.format(start);
  const lastDay = formats.fullDate.format(end);
  const when = o.allDay
    ? day === lastDay
      ? day
      : `${day} – ${lastDay}`
    : `${day} · ${formats.time.format(start)} – ${formats.time.format(end)}`;

  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="nowrap" justify="space-between">
        <Group gap="xs" wrap="nowrap">
          <ColorSwatch color={colors[o.calendarId] ?? 'gray'} size={12} aria-hidden />
          <Text size="xs">{calendar?.name}</Text>
        </Group>
        <CloseButton size="sm" onClick={onClose} aria-label={t('common.close')} data-autofocus />
      </Group>
      <Title order={3} size="h4">
        {o.summary || t('calendar.untitled')}
      </Title>
      {shared && calendar?.owner.name && (
        <Text size="sm" c="dimmed">
          {t('editor.sharedBy', { name: calendar.owner.name })}
        </Text>
      )}
      {addedBy && (
        <Text size="sm" c="dimmed">
          {t('editor.addedBy', { name: addedBy })}
        </Text>
      )}
      <Text size="sm">{when}</Text>
      {o.location && <Text size="sm">{o.location}</Text>}
      {o.description && (
        <Text size="sm" className={classes.notes}>
          {o.description}
        </Text>
      )}
      {!shared && (
        <>
          <ReminderChips
            value={event.data?.reminders ?? []}
            onChange={(reminders: number[]): void =>
              setReminders.mutate({ id: o.eventId, reminders }, { onSuccess: () => announce(t('reminders.saved')) })
            }
            disabled={event.isPending || setReminders.isPending}
          />
          {setReminders.error && (
            <Text size="xs" c="red" role="alert">
              {t('reminders.saveFailed', { message: setReminders.error.message })}
            </Text>
          )}
        </>
      )}
      <Text size="xs" c="dimmed">
        {shared ? t('editor.readOnlyShared') : t('editor.readOnly')}
      </Text>
    </Stack>
  );
}
