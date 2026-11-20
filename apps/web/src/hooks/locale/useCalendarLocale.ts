import { useTranslation } from 'react-i18next';
import { useSettings } from '@/hooks/settings';
import { type CalendarLocale, calendarLocale } from '@/services/locale';

/** The Intl locale for the current UI language, and the week start (the user's choice, else the language's). */
export function useCalendarLocale(): CalendarLocale {
  const { i18n } = useTranslation();
  const chosen = useSettings().data?.weekStart;
  const base = calendarLocale(i18n.language);
  return chosen == null ? base : { ...base, weekStart: chosen };
}
