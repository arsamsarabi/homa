import { CloseButton, ColorSwatch, Group, Stack, Text, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarPageModel, useTravelLabel } from '@/pages/calendar/model';
import type { Occurrence } from '@/schemas';
import { wallOf } from '@/services/zones';

export type FreeBusyDetailsProps = { occurrence: Occurrence; onClose: () => void };

/** A free/busy block: Busy, the owner's name, and the times — nothing else (GET /events is 404). */
export function FreeBusyDetails({ occurrence: o, onClose }: FreeBusyDetailsProps): JSX.Element {
  const { t } = useTranslation();
  const { calendarById, colors, formats, tz } = useCalendarPageModel();
  const calendar = calendarById[o.calendarId];
  const travel = useTravelLabel()(o);
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
        {t('calendar.busy')}
      </Title>
      {calendar?.owner.name && (
        <Text size="sm" c="dimmed">
          {t('editor.sharedBy', { name: calendar.owner.name })}
        </Text>
      )}
      <Text size="sm">{when}</Text>
      {travel && (
        <Text size="sm" c="dimmed">
          {travel}
        </Text>
      )}
    </Stack>
  );
}
