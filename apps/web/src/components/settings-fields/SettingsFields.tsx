import { Checkbox, NativeSelect, Radio, Select, Stack, Switch } from '@mantine/core';
import { type ChangeEvent, type JSX, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_WORK_WEEK_DAYS,
  SECONDARY_CALENDARS,
  type SecondaryCalendar,
  type Settings,
  SHARING_PRESETS,
  type SharingPreset,
} from '@/schemas';
import { calendarLocale } from '@/services/locale';
import { DEFAULT_REMINDER, offsetLabel, REMINDER_PRESETS } from '@/services/reminders';
import { timeZones } from '@/services/zones';

export type SettingsFieldsProps = {
  value: Settings;
  /** The browser's zone, used when no home zone is set. */
  browserTz: string;
  onChange: (patch: Partial<Settings>) => void;
  /** Onboarding asks with its own visibility radios; hide the Settings sharing preset there. */
  hideSharing?: boolean;
};

const BROWSER = 'browser';
const NO_REMINDER = 'none';
// 2026-11-15 was a Sunday, so day d of that week has getUTCDay() === d.
const weekdayOf = (d: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 15 + d));

/** The home time zone, the week start, work-week days, the second calendar and the default reminder. */
export function SettingsFields({ value, browserTz, onChange, hideSharing }: SettingsFieldsProps): JSX.Element {
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
  const workWeekDays = value.workWeekDays ?? [...DEFAULT_WORK_WEEK_DAYS];
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
      <Checkbox.Group
        label={t('settings.workWeekDays')}
        description={t('settings.workWeekDaysHint')}
        value={workWeekDays.map(String)}
        onChange={(picked: string[]): void => {
          if (picked.length < 1 || picked.length > 7) return;
          const days = picked.map(Number).filter((d) => d >= 0 && d <= 6);
          if (days.length < 1) return;
          onChange({ workWeekDays: days });
        }}
      >
        <Stack mt="xs" gap="xs">
          {weekDays.map((d) => (
            <Checkbox
              key={d.value}
              value={d.value}
              label={d.label}
              disabled={workWeekDays.length === 1 && workWeekDays[0] === Number(d.value)}
            />
          ))}
        </Stack>
      </Checkbox.Group>
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
      <Switch
        label={t('settings.shortcutHints')}
        description={t('settings.shortcutHintsHint')}
        checked={value.showShortcutHints}
        onChange={(e: ChangeEvent<HTMLInputElement>): void => onChange({ showShortcutHints: e.currentTarget.checked })}
      />
      {!hideSharing && (
        <Radio.Group
          label={t('sharing.preset')}
          description={t('sharing.presetHint')}
          value={value.sharingPreset}
          onChange={(v: string): void => onChange({ sharingPreset: v as SharingPreset })}
        >
          <Stack mt="xs" gap="xs">
            {SHARING_PRESETS.map((p) => (
              <Radio key={p} value={p} label={t(`sharing.presetOption.${p}`)} />
            ))}
          </Stack>
        </Radio.Group>
      )}
    </Stack>
  );
}
