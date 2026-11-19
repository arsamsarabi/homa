import { ActionIcon, Button, Group, SegmentedControl, Title } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './CalendarToolbar.module.css';
import { useCalendarToolbar } from './useCalendarToolbar';

/** Today, previous and next, the title, the view switcher and "New event". */
export function CalendarToolbar(): JSX.Element {
  const { t } = useTranslation();
  const bar = useCalendarToolbar();
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
        <Title order={2} size="h3" aria-live="polite">
          {bar.title}
        </Title>
      </Group>
      <Group gap="xs">
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
