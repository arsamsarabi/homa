import { useTranslation } from 'react-i18next';
import type { Occurrence } from '@/schemas';
import { travelDuration } from '@/services/event-form';

/** "1 hr travel time" for an occurrence with travel time; undefined when it has none. */
export function useTravelLabel(): (o: Pick<Occurrence, 'travelMinutes'>) => string | undefined {
  const { t, i18n } = useTranslation();
  return (o: Pick<Occurrence, 'travelMinutes'>): string | undefined =>
    o.travelMinutes ? t('calendar.travel', { duration: travelDuration(o.travelMinutes, i18n.language) }) : undefined;
}
