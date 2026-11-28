import { Chip, Group, Text } from '@mantine/core';
import { IconRepeat } from '@tabler/icons-react';
import { type JSX, type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AmountPicker } from '@/components/amount-picker';
import { useCalendarLocale } from '@/hooks/locale';
import {
  MAX_REPEAT_EVERY,
  parseRepeat,
  REPEAT_PRESETS,
  REPEAT_UNITS,
  type RepeatUnit,
  repeatLabel,
  repeatRule,
  type SimpleRepeat,
  sameRepeat,
  simpleRepeatLabel,
  type WeekdayCode,
  weekdayName,
  weekOrder,
} from '@/services/repeat';

export type RepeatPickerProps = {
  /** The RRULE, or null for none. */
  value: string | null;
  onChange: (rrule: string | null) => void;
  /** The start's weekday: weekly rules default to it, and a rule on just it leaves BYDAY out. */
  startDay?: WeekdayCode;
  /** The units the custom row offers; all of REPEAT_UNITS by default. */
  units?: readonly RepeatUnit[];
  label?: string;
  description?: ReactNode;
  disabled?: boolean;
};

/** "Does not repeat", presets, and "Every [N] [unit]" (on weekdays, for weeks). Keeps rules it can't build. */
export function RepeatPicker({
  value,
  onChange,
  startDay,
  units = REPEAT_UNITS,
  label,
  description,
  disabled,
}: RepeatPickerProps): JSX.Element {
  const { t } = useTranslation();
  const { locale, weekStart } = useCalendarLocale();
  const current = parseRepeat(value);
  const [days, setDays] = useState<WeekdayCode[]>([]);
  const daysId = useId();
  const sentence = (r: SimpleRepeat | null): string =>
    r ? simpleRepeatLabel(r, t, locale, weekStart) : t('repeat.none');

  const presets = REPEAT_PRESETS.map((r) => ({ rule: r ? repeatRule(r, startDay) : null, label: sentence(r) }));
  const offList = value && !presets.some((p) => sameRepeat(p.rule, value));
  const options = [
    ...presets.map((p) => ({
      key: p.rule ?? 'none',
      label: p.label,
      selected: sameRepeat(p.rule, value),
      onSelect: (): void => onChange(p.rule),
    })),
    // The current rule when it isn't a preset; one the picker can't build only shows.
    ...(offList
      ? [
          {
            key: `current:${value}`,
            label: repeatLabel(value, t, locale, weekStart),
            selected: true,
            ...(current !== 'custom' && { onSelect: (): void => onChange(value) }),
          },
        ]
      : []),
  ];
  const simple = current && current !== 'custom' ? current : undefined;
  const ownDays = (r: SimpleRepeat | undefined): WeekdayCode[] =>
    r?.days.length ? r.days : startDay ? [startDay] : [];

  return (
    <AmountPicker<RepeatUnit>
      label={label ?? t('editor.repeat')}
      description={description}
      icon={<IconRepeat size={14} aria-hidden />}
      valueText={repeatLabel(value, t, locale, weekStart)}
      disabled={disabled}
      options={options}
      units={units.map((u) => ({ value: u, label: (count: number) => t(`units.${u}`, { count }) }))}
      initial={{ amount: simple?.every ?? 1, unit: simple?.unit ?? 'weeks' }}
      onOpen={(): void => setDays(ownDays(simple))}
      prefix={t('repeat.every')}
      preview={(every: number, unit: RepeatUnit): string => sentence({ every, unit, days })}
      onCustom={(every: number, unit: RepeatUnit): string | undefined => {
        if (every > MAX_REPEAT_EVERY) return t('repeat.tooMany', { max: MAX_REPEAT_EVERY });
        onChange(repeatRule({ every, unit, days }, startDay));
        return undefined;
      }}
      submitLabel={t('repeat.set')}
      extra={(unit: RepeatUnit): ReactNode =>
        unit === 'weeks' && (
          <div>
            <Text size="xs" c="dimmed" mb={4} id={daysId}>
              {t('repeat.on')}
            </Text>
            <Chip.Group
              multiple
              value={days}
              onChange={(v: string[]): void => setDays(v.length ? (v as WeekdayCode[]) : days)}
            >
              <Group gap={4} role="group" aria-labelledby={daysId}>
                {weekOrder(weekStart).map((d) => (
                  <Chip key={d} value={d} size="xs" radius="sm" aria-label={weekdayName(d, locale, 'long')}>
                    {weekdayName(d, locale, 'narrow')}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </div>
        )
      }
    />
  );
}
