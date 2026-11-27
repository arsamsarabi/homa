import { ActionIcon, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconEye, IconEyeOff, IconPencil } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { Calendar } from '@/schemas';
import { CalendarColorButton } from './CalendarColorButton';
import { useCalendarsTabModel } from './CalendarsTabProvider';

export type CalendarRowProps = {
  calendar: Calendar;
  /** A short note after the name, such as "Read-only" or the access level. */
  note?: string;
  /** Rename, recolor and share in the edit drawer: calendars you own. */
  editable: boolean;
};

/** A calendar in a card: its color (yours alone for a shared one), name, show or hide, and edit. */
export function CalendarRow({ calendar: c, note, editable }: CalendarRowProps): JSX.Element {
  const { t } = useTranslation();
  const tab = useCalendarsTabModel();
  const toggleLabel = t(c.hidden ? 'calendars.show' : 'calendars.hide', { name: c.name });
  return (
    <Group component="li" justify="space-between" wrap="nowrap" aria-label={c.name}>
      <Group gap="xs" wrap="nowrap" miw={0}>
        <CalendarColorButton name={c.name} color={c.color} onPick={(color: string): void => tab.recolor(c, color)} />
        <Stack gap={0} miw={0}>
          <Text size="sm" truncate c={c.hidden ? 'dimmed' : undefined}>
            {c.name}
          </Text>
          {(note || c.hidden) && (
            <Text size="xs" c="dimmed">
              {[note, c.hidden ? t('calendars.hiddenLabel') : undefined].filter(Boolean).join(' · ')}
            </Text>
          )}
        </Stack>
      </Group>
      <Group gap={4} wrap="nowrap">
        <Tooltip label={toggleLabel}>
          <ActionIcon variant="subtle" onClick={(): void => tab.toggle(c)} aria-label={toggleLabel}>
            {c.hidden ? <IconEyeOff size={16} aria-hidden /> : <IconEye size={16} aria-hidden />}
          </ActionIcon>
        </Tooltip>
        {editable && (
          <ActionIcon
            variant="subtle"
            onClick={(): void => tab.editing.open(c)}
            aria-label={t('connections.editCalendar', { name: c.name })}
          >
            <IconPencil size={16} aria-hidden />
          </ActionIcon>
        )}
      </Group>
    </Group>
  );
}
