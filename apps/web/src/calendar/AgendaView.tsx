// Agenda: the next 30 days as a list, grouped by day.
import { Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { Occurrence } from './api';
import { localSpan, sameDay, touchesDay } from './dates';

type Props = {
  days: Date[];
  occurrences: Occurrence[];
  colors: Record<string, string>;
  locale: string;
  onOpen: (o: Occurrence) => void;
};

export function AgendaView({ days, occurrences, colors, locale, onOpen }: Props) {
  const { t } = useTranslation();
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
  const groups = days
    .map((d) => ({ d, items: occurrences.filter((o) => touchesDay(localSpan(o), d)) }))
    .filter((g) => g.items.length);
  if (!groups.length) return <Text c="dimmed">{t('calendar.agendaEmpty')}</Text>;
  return (
    <Stack gap="lg" className="av">
      {groups.map(({ d, items }) => (
        <section key={d.toISOString()}>
          <Title order={4} mb={6} aria-current={sameDay(d, new Date()) ? 'date' : undefined}>
            {dayFmt.format(d)}
          </Title>
          <Stack gap={4}>
            {items.map((o) => (
              <UnstyledButton
                key={`${o.eventId}${o.recurrenceId}`}
                className="av-row"
                style={{ '--c': colors[o.calendarId] } as React.CSSProperties}
                onClick={() => onOpen(o)}
              >
                <span className="av-time">
                  {o.allDay
                    ? t('calendar.allDay')
                    : `${time.format(new Date(o.start))} – ${time.format(new Date(o.end))}`}
                </span>
                <span className="av-title">{o.summary || t('calendar.untitled')}</span>
                {o.location && <span className="av-loc">{o.location}</span>}
              </UnstyledButton>
            ))}
          </Stack>
        </section>
      ))}
    </Stack>
  );
}
