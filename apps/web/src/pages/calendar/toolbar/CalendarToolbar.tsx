import { ActionIcon, Button, Group, SegmentedControl, Select, Stack, Text, Title } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconPlus, IconWorld } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarFilter } from './CalendarFilter';
import classes from './CalendarToolbar.module.css';
import { useCalendarShortcuts } from './useCalendarShortcuts';
import { useCalendarToolbar } from './useCalendarToolbar';

/** Today, previous and next, the title, the calendar filter, the zone, the view switcher and "New event". */
export function CalendarToolbar(): JSX.Element {
  const { t } = useTranslation();
  const bar = useCalendarToolbar();
  useCalendarShortcuts(bar);
  return (
    <Group justify="space-between" wrap="wrap" gap="sm">
      <Group gap="xs">
        <Button variant="default" onClick={bar.today}>
          {t('calendar.today')}
        </Button>
        <ActionIcon variant="subtle" size="lg" onClick={bar.previous} aria-label={t('calendar.previous')}>
          <IconChevronLeft size={18} className={classes.chevron} aria-hidden />
        </ActionIcon>
        <ActionIcon variant="subtle" size="lg" onClick={bar.next} aria-label={t('calendar.next')}>
          <IconChevronRight size={18} className={classes.chevron} aria-hidden />
        </ActionIcon>
        <Stack gap={0}>
          <Title order={2} size="h3" aria-live="polite">
            {bar.title}
          </Title>
          {bar.jalaliTitle && (
            <Text size="sm" c="dimmed">
              {bar.jalaliTitle}
            </Text>
          )}
        </Stack>
      </Group>
      <Group gap="xs">
        <CalendarFilter />
        <Select
          aria-label={t('calendar.timeZone')}
          leftSection={<IconWorld size={16} aria-hidden />}
          data={bar.zones}
          value={bar.tz}
          onChange={bar.pickZone}
          searchable
          allowDeselect={false}
          limit={50}
          w={220}
        />
        <SegmentedControl
          value={bar.view}
          onChange={bar.pickView}
          data={bar.views}
          aria-label={t('calendar.viewLabel')}
        />
        <Button leftSection={<IconPlus size={16} aria-hidden />} onClick={bar.newEvent}>
          {t('calendar.newEvent')}
        </Button>
      </Group>
    </Group>
  );
}
