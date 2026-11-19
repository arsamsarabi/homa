import { Box, Group, Paper, SimpleGrid, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

/** The days to show for the month of `ref`: whole weeks, starting on `weekStart` (0 = Sunday). */
export function monthGrid(ref: Date, weekStart: number) {
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const weeks = Math.ceil((offset + last.getDate()) / 7);
  return Array.from(
    { length: weeks * 7 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

export function Calendar() {
  const { t, i18n } = useTranslation();
  const today = new Date();
  // shortcut: Gregorian only; the Solar Hijri view comes with the calendar core (phase 2).
  const locale = i18n.language === 'fa' ? 'fa-IR-u-ca-gregory' : 'en-GB';
  const weekStart = i18n.language === 'fa' ? 6 : 1;
  const days = monthGrid(today, weekStart);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const dayNum = new Intl.DateTimeFormat(locale, { day: 'numeric' });

  return (
    <Box>
      <Group justify="space-between" mb="md">
        <Title order={2}>{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(today)}</Title>
        <Text c="dimmed" size="sm">
          {t('calendar.empty')}
        </Text>
      </Group>
      <SimpleGrid cols={7} spacing={4} verticalSpacing={4}>
        {days.slice(0, 7).map((d) => (
          <Text key={`h${d.getDay()}`} size="xs" c="dimmed" ta="center" fw={500}>
            {weekday.format(d)}
          </Text>
        ))}
        {days.map((d) => {
          const isToday = d.toDateString() === today.toDateString();
          const inMonth = d.getMonth() === today.getMonth();
          return (
            <Paper
              key={d.toISOString()}
              withBorder
              h={96}
              p={6}
              style={isToday ? { borderColor: 'var(--mantine-primary-color-filled)', borderWidth: 2 } : undefined}
              opacity={inMonth ? 1 : 0.45}
              aria-current={isToday ? 'date' : undefined}
            >
              <Text size="sm" fw={isToday ? 700 : 400}>
                {dayNum.format(d)}
              </Text>
            </Paper>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}
