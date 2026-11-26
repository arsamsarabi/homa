import { Button, Group, Select } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarFilter } from './CalendarFilter';
import { DateNav } from './DateNav';
import { useCalendarShortcuts } from './useCalendarShortcuts';
import { useCalendarToolbar } from './useCalendarToolbar';

/** Today, previous and next, the title, the calendar filter, the view switcher and "New event". */
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
        <DateNav
          title={bar.title}
          secondaryTitle={bar.jalaliTitle}
          previousLabel={t('calendar.previous')}
          nextLabel={t('calendar.next')}
          onPrevious={bar.previous}
          onNext={bar.next}
        />
      </Group>
      <Group gap="xs">
        <CalendarFilter />
        <Select
          aria-label={t('calendar.viewLabel')}
          data={bar.views}
          value={bar.view}
          onChange={(v: string | null): void => {
            if (v) bar.pickView(v);
          }}
          allowDeselect={false}
          w={140}
        />
        <Button leftSection={<IconPlus size={16} aria-hidden />} onClick={bar.newEvent}>
          {t('calendar.newEvent')}
        </Button>
      </Group>
    </Group>
  );
}
