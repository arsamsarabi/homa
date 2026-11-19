import { useHotkeys } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { type Language, languages } from '@/lib/i18n';
import { CALENDAR_SHORTCUTS, type CalendarCommand, directed } from '@/services/shortcuts';
import type { CalendarToolbar } from './useCalendarToolbar';

/** The calendar's keyboard shortcuts (see @/services/shortcuts), run through the toolbar's actions. */
export function useCalendarShortcuts(bar: CalendarToolbar): void {
  const { i18n } = useTranslation();
  const rtl = languages[i18n.language as Language]?.dir === 'rtl';
  const run = (command: CalendarCommand): void => {
    // Leave the keys alone while a drawer, modal or the palette is open.
    if (document.querySelector('[role="dialog"]')) return;
    const c = directed(command, rtl);
    if (c === 'today') bar.today();
    else if (c === 'previous') bar.previous();
    else if (c === 'next') bar.next();
    else if (c === 'newEvent') bar.newEvent();
    else bar.pickView(c.slice('view.'.length));
  };
  useHotkeys(CALENDAR_SHORTCUTS.map((s) => [s.hotkey, (): void => run(s.command), { usePhysicalKeys: true }]));
}
