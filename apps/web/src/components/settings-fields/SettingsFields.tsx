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

/** The home time zone and the second calendar. */
export function SettingsFields({ value, browserTz, onChange }: SettingsFieldsProps): JSX.Element {
  const { t } = useTranslation();
  const zones = useMemo(
    (): { value: string; label: string }[] => [
      { value: BROWSER, label: t('settings.browserZone', { tz: browserTz }) },
      ...timeZones().map((z) => ({ value: z, label: z })),
    ],
    [t, browserTz],
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
