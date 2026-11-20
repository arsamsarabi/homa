import { Radio, Select, Stack } from '@mantine/core';
import { type JSX, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SECONDARY_CALENDARS, type SecondaryCalendar, type Settings } from '@/schemas';
import { timeZones } from '@/services/zones';

export type SettingsFieldsProps = {
  value: Settings;
  /** The browser's zone, used when no home zone is set. */
  browserTz: string;
  onChange: (patch: Partial<Settings>) => void;
};

const BROWSER = 'browser';
const LANGUAGE = 'language';
// 2026-11-15 was a Sunday, so day d of that week has getUTCDay() === d.
const weekdayOf = (d: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 15 + d));

/** The home time zone and the second calendar. */
export function SettingsFields({ value, browserTz, onChange }: SettingsFieldsProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const zones = useMemo(
    (): { value: string; label: string }[] => [
      { value: BROWSER, label: t('settings.browserZone', { tz: browserTz }) },
      ...timeZones().map((z) => ({ value: z, label: z })),
    ],
    [t, browserTz],
  );
  const weekDays = useMemo(
    (): { value: string; label: string }[] => [
      { value: LANGUAGE, label: t('settings.weekStartLanguage') },
      ...[1, 6, 0, 2, 3, 4, 5].map((d) => ({ value: String(d), label: weekdayOf(d, i18n.language) })),
    ],
    [t, i18n.language],
  );
  return (
    <Stack>
      <Select
        label={t('settings.homeZone')}
        description={t('settings.homeZoneHint')}
        data={zones}
        value={value.homeTz ?? BROWSER}
        onChange={(v: string | null): void => onChange({ homeTz: !v || v === BROWSER ? null : v })}
        searchable
        allowDeselect={false}
        limit={50}
      />
      <Select
        label={t('settings.weekStart')}
        data={weekDays}
        value={value.weekStart == null ? LANGUAGE : String(value.weekStart)}
        onChange={(v: string | null): void => onChange({ weekStart: !v || v === LANGUAGE ? null : Number(v) })}
        allowDeselect={false}
      />
      <Radio.Group
        label={t('settings.secondaryCalendar')}
        value={value.secondaryCalendar}
        onChange={(v: string): void => onChange({ secondaryCalendar: v as SecondaryCalendar })}
      >
        <Stack mt="xs" gap="xs">
          {SECONDARY_CALENDARS.map((c) => (
            <Radio key={c} value={c} label={t(`settings.secondary.${c}`)} />
          ))}
        </Stack>
      </Radio.Group>
    </Stack>
  );
}
