import { NativeSelect, Radio, Select, Stack } from '@mantine/core';
import { type ChangeEvent, type JSX, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SECONDARY_CALENDARS, type SecondaryCalendar, type Settings } from '@/schemas';
import { calendarLocale } from '@/services/locale';
import { DEFAULT_REMINDER, offsetLabel, REMINDER_PRESETS } from '@/services/reminders';
import { timeZones } from '@/services/zones';

export type SettingsFieldsProps = {
  value: Settings;
  /** The browser's zone, used when no home zone is set. */
  browserTz: string;
  onChange: (patch: Partial<Settings>) => void;
};

const BROWSER = 'browser';
const NO_REMINDER = 'none';
// 2026-11-15 was a Sunday, so day d of that week has getUTCDay() === d.
const weekdayOf = (d: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 15 + d));

/** The home time zone, the week start, the second calendar and the default reminder. */
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
    // Monday to Sunday.
    (): { value: string; label: string }[] =>
      [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: weekdayOf(d, i18n.language) })),
    [i18n.language],
  );
  const reminderOptions = useMemo(
    (): { value: string; label: string }[] => [
      { value: NO_REMINDER, label: t('reminders.none') },
      ...REMINDER_PRESETS.map((m) => {
        const l = offsetLabel(m);
        return {
          value: String(m),
          label: l.key === 'atStart' ? t('reminders.atStart') : t(`reminders.${l.key}`, { count: l.count }),
        };
      }),
    ],
    [t],
  );
  const reminder = value.defaultReminderMinutes === undefined ? DEFAULT_REMINDER : value.defaultReminderMinutes;
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
        // Unset follows the language (Monday, or Saturday in Farsi).
        value={String(value.weekStart ?? calendarLocale(i18n.language).weekStart)}
        onChange={(v: string | null): void => onChange({ weekStart: v ? Number(v) : null })}
        allowDeselect={false}
        maxDropdownHeight={300}
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
      <NativeSelect
        label={t('reminders.default')}
        description={t('reminders.defaultHint')}
        data={reminderOptions}
        value={reminder === null ? NO_REMINDER : String(reminder)}
        onChange={(e: ChangeEvent<HTMLSelectElement>): void => {
          const v = e.currentTarget.value;
          onChange({ defaultReminderMinutes: v === NO_REMINDER ? null : Number(v) });
        }}
      />
    </Stack>
  );
}
