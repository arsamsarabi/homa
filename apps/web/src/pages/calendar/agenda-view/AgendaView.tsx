// Agenda: the next 30 days as a list, grouped by day.
import { Stack, Text, Title, UnstyledButton, VisuallyHidden } from '@mantine/core';
import type { CSSProperties, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarPageModel } from '@/pages/calendar/model';
import { occurrenceTitle } from '@/services/calendar-sharing';
import { sameDay } from '@/services/dates';
import classes from './AgendaView.module.css';
import { useAgendaView } from './useAgendaView';

export function AgendaView(): JSX.Element {
  const { t } = useTranslation();
  const { formats, colors, secondary, today, accessOf } = useCalendarPageModel();
  const { groups, open, span, occasions } = useAgendaView();
  const labels = { busy: t('calendar.busy'), untitled: t('calendar.untitled') };

  if (!groups.length) return <Text c="dimmed">{t('calendar.agendaEmpty')}</Text>;
  return (
    <Stack component="section" aria-label={t('calendar.views.agenda')} gap="lg">
      {groups.map(({ day, items }) => (
        <section key={day.toISOString()}>
          <Title order={3} size="h4" mb={6} aria-current={sameDay(day, today) ? 'date' : undefined}>
            {formats.weekdayLong.format(day)}
            {secondary === 'jalali' && (
              <Text component="span" c="dimmed" fw={400} ms="xs" size="sm">
                {formats.jalaliDayMonth.format(day)}
              </Text>
            )}
            {occasions(day).map((o) => (
              <Text key={o} component="span" fw={500} ms="xs" size="sm">
                {t(`occasions.${o}`)}
              </Text>
            ))}
          </Title>
          <Stack gap={4}>
            {items.map((o) => {
              const access = accessOf(o.calendarId);
              return (
                <UnstyledButton
                  key={`${o.eventId}${o.recurrenceId}`}
                  className={classes.row}
                  style={{ '--c': colors[o.calendarId] } as CSSProperties}
                  data-freebusy={access === 'freebusy' || undefined}
                  onClick={() => open(o)}
                >
                  <span className={classes.time}>
                    {o.allDay
                      ? t('calendar.allDay')
                      : `${formats.time.format(span(o).start)} – ${formats.time.format(span(o).end)}`}
                  </span>
                  <span className={classes.title}>
                    {o.taskDone ? (
                      <s>{occurrenceTitle(o.summary, access, labels)}</s>
                    ) : (
                      occurrenceTitle(o.summary, access, labels)
                    )}
                    {o.taskDone && <VisuallyHidden>{t('calendar.taskDone')}</VisuallyHidden>}
                  </span>
                  {o.location && access !== 'freebusy' && <span className={classes.location}>{o.location}</span>}
                </UnstyledButton>
              );
            })}
          </Stack>
        </section>
      ))}
    </Stack>
  );
}
