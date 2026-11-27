import { Button, type ComboboxItem, type ComboboxLikeRenderOptionInput, Group, Select } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { ShortcutHint, useShortcutHints } from '@/components';
import { type Language, languages } from '@/lib/i18n';
import type { View } from '@/schemas';
import { CALENDAR_SHORTCUTS, directed } from '@/services/shortcuts';
import { CalendarFilter } from './CalendarFilter';
import { DateNav } from './DateNav';
import { useCalendarShortcuts } from './useCalendarShortcuts';
import { useCalendarToolbar } from './useCalendarToolbar';

/** Today, previous and next, the title, the calendar filter, the view switcher and "New event". */
export function CalendarToolbar(): JSX.Element {
  const { t, i18n } = useTranslation();
  const bar = useCalendarToolbar();
  const hints = useShortcutHints();
  const rtl = languages[i18n.language as Language]?.dir === 'rtl';
  // The key that runs a command; in right-to-left layouts the arrows swap (see directed).
  const keyFor = (c: 'previous' | 'next'): string | undefined =>
    hints ? CALENDAR_SHORTCUTS.find((s) => directed(s.command, rtl) === c)?.label : undefined;
  useCalendarShortcuts(bar);
  return (
    <Group justify="space-between" wrap="wrap" gap="sm">
      <Group gap="xs">
        <Button variant="default" onClick={bar.today} rightSection={<ShortcutHint command="today" />}>
          {t('calendar.today')}
        </Button>
        <DateNav
          title={bar.title}
          secondaryTitle={bar.jalaliTitle}
          previousLabel={t('calendar.previous')}
          nextLabel={t('calendar.next')}
          onPrevious={bar.previous}
          onNext={bar.next}
          previousKey={keyFor('previous')}
          nextKey={keyFor('next')}
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
          w={160}
          renderOption={({ option }: ComboboxLikeRenderOptionInput<ComboboxItem>): JSX.Element => (
            <Group justify="space-between" wrap="nowrap" flex={1}>
              {option.label}
              <ShortcutHint command={`view.${option.value as View}`} />
            </Group>
          )}
        />
        <Button
          leftSection={<IconPlus size={16} aria-hidden />}
          rightSection={<ShortcutHint command="newEvent" />}
          onClick={bar.newEvent}
        >
          {t('calendar.newEvent')}
        </Button>
      </Group>
    </Group>
  );
}
