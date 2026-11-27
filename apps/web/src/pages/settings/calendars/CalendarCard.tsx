import { Group, Paper, Stack, Text } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import classes from './CalendarsTab.module.css';

export type CalendarCardProps = {
  title: string;
  /** Beside the title: a provider name, a status badge. */
  badges?: ReactNode;
  /** One line under the title. */
  subtitle?: ReactNode;
  /** At the end of the header: the card's menu. */
  actions?: ReactNode;
  /** Alerts and notes between the header and the calendars. */
  notes?: ReactNode;
  /** The card's calendars, as CalendarRow items. */
  children: ReactNode;
  /** Names the calendar list for screen readers. */
  listLabel: string;
};

/** One group of calendars in Settings → Calendars: a header, notes, then its calendars. */
export function CalendarCard({
  title,
  badges,
  subtitle,
  actions,
  notes,
  children,
  listLabel,
}: CalendarCardProps): JSX.Element {
  return (
    <Paper withBorder p="md" radius="md" component="li" aria-label={title}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={2} miw={0}>
            <Group gap="xs" wrap="wrap">
              <Text fw={600}>{title}</Text>
              {badges}
            </Group>
            {subtitle && (
              <Text size="xs" c="dimmed">
                {subtitle}
              </Text>
            )}
          </Stack>
          {actions}
        </Group>
        {notes}
        <Stack component="ul" gap={4} className={classes.list} aria-label={listLabel}>
          {children}
        </Stack>
      </Stack>
    </Paper>
  );
}
