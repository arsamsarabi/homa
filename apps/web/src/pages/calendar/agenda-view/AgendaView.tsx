// Agenda: the next 30 days as a list, grouped by day.
import { Stack, Text, Title, UnstyledButton } from '@mantine/core';
import type { CSSProperties, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { sameDay } from '@/services/dates';
import classes from './AgendaView.module.css';
import { useAgendaView } from './useAgendaView';

export function AgendaView(): JSX.Element {
  const { t } = useTranslation();
  const { formats, colors } = useCalendarPageModel();
  const { groups, open } = useAgendaView();
  const today = new Date();

  if (!groups.length) return <Text c="dimmed">{t('calendar.agendaEmpty')}</Text>;
  return (
    <Stack component="section" aria-label={t('calendar.views.agenda')} gap="lg">
      {groups.map(({ day, items }) => (
        <section key={day.toISOString()}>
          <Title order={3} size="h4" mb={6} aria-current={sameDay(day, today) ? 'date' : undefined}>
            {formats.weekdayLong.format(day)}
          </Title>
          <Stack gap={4}>
            {items.map((o) => (
              <UnstyledButton
                key={`${o.eventId}${o.recurrenceId}`}
                className={classes.row}
                style={{ '--c': colors[o.calendarId] } as CSSProperties}
                onClick={() => open(o)}
              >
                <span className={classes.time}>
                  {o.allDay
                    ? t('calendar.allDay')
                    : `${formats.time.format(new Date(o.start))} – ${formats.time.format(new Date(o.end))}`}
                </span>
                <span className={classes.title}>{o.summary || t('calendar.untitled')}</span>
                {o.location && <span className={classes.location}>{o.location}</span>}
              </UnstyledButton>
            ))}
          </Stack>
        </section>
      ))}
    </Stack>
  );
}
