import { useTranslation } from 'react-i18next';
import { type CalendarLocale, calendarLocale } from '@/services/locale';

/** The Intl locale and week start for the current UI language. */
export function useCalendarLocale(): CalendarLocale {
  const { i18n } = useTranslation();
  return calendarLocale(i18n.language);
}
