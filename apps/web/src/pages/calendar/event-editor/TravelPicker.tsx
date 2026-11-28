import { IconCar } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { AmountPicker } from '@/components/amount-picker';
import { MAX_TRAVEL_MINUTES, travelChoices, travelDuration } from '@/services/event-form';

type TravelUnit = 'minutes' | 'hours';

export type TravelPickerProps = {
  /** Minutes of travel before the event, or null for none. */
  value: number | null;
  onChange: (minutes: number | null) => void;
  description?: string;
};

/** Travel time before an event: None, the presets, or your own minutes or hours (up to 24 hours). */
export function TravelPicker({ value, onChange, description }: TravelPickerProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const words = (minutes: number | null): string =>
    minutes ? t('calendar.travel', { duration: travelDuration(minutes, locale) }) : t('editor.travelNone');
  const toMinutes = (n: number, unit: TravelUnit): number => (unit === 'hours' ? n * 60 : n);
  return (
    <AmountPicker<TravelUnit>
      label={t('editor.travel')}
      description={description}
      icon={<IconCar size={14} aria-hidden />}
      valueText={words(value)}
      options={[null, ...travelChoices(value)].map((m) => ({
        key: String(m ?? 'none'),
        label: m ? travelDuration(m, locale) : t('editor.travelNone'),
        selected: m === value,
        onSelect: (): void => onChange(m),
      }))}
      units={(['minutes', 'hours'] as const).map((u) => ({
        value: u,
        label: (count: number) => t(`units.${u}`, { count }),
      }))}
      initial={
        value && value % 60 === 0 ? { amount: value / 60, unit: 'hours' } : { amount: value ?? 45, unit: 'minutes' }
      }
      preview={(n: number, unit: TravelUnit): string => words(toMinutes(n, unit))}
      onCustom={(n: number, unit: TravelUnit): string | undefined => {
        const minutes = toMinutes(n, unit);
        if (minutes > MAX_TRAVEL_MINUTES) return t('editor.travelMax');
        onChange(minutes);
        return undefined;
      }}
      submitLabel={t('editor.travelSet')}
    />
  );
}
