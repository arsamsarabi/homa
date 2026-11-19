import { Radio, Select, Stack, TextInput } from '@mantine/core';
import { type ChangeEvent, type JSX, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type Language, languages } from '@/lib/i18n';
import { type InstanceSettings, SECONDARY_CALENDARS, type SecondaryCalendar, SIGN_UPS, type SignUps } from '@/schemas';
import { timeZones } from '@/services/zones';

export type InstanceFieldsProps = {
  value: InstanceSettings;
  onChange: (patch: Partial<InstanceSettings>) => void;
};

const BROWSER = 'browser';
const LANGUAGE_OPTIONS = Object.entries(languages).map(([value, { label }]) => ({ value, label }));

/** The instance's name, who can sign up, and the defaults new accounts start with. */
export function InstanceFields({ value, onChange }: InstanceFieldsProps): JSX.Element {
  const { t } = useTranslation();
  const zones = useMemo(
    (): { value: string; label: string }[] => [
      { value: BROWSER, label: t('instance.browserZone') },
      ...timeZones().map((z) => ({ value: z, label: z })),
    ],
    [t],
  );
  return (
    <Stack>
      <TextInput
        label={t('instance.name')}
        description={t('instance.nameHint')}
        value={value.name}
        onChange={(e: ChangeEvent<HTMLInputElement>): void => onChange({ name: e.currentTarget.value })}
        error={value.name.trim() === '' ? t('instance.nameRequired') : undefined}
        required
        maxLength={60}
      />
      <Radio.Group
        label={t('instance.signUps')}
        value={value.signUps}
        onChange={(v: string): void => onChange({ signUps: v as SignUps })}
      >
        <Stack mt="xs" gap="xs">
          {SIGN_UPS.map((s) => (
            <Radio
              key={s}
              value={s}
              label={t(`instance.signUpsOption.${s}`)}
              description={t(`instance.signUpsHint.${s}`)}
            />
          ))}
        </Stack>
      </Radio.Group>
      <Select
        label={t('instance.defaultLanguage')}
        description={t('instance.defaultLanguageHint')}
        data={LANGUAGE_OPTIONS}
        value={value.defaultLanguage}
        onChange={(v: string | null): void => {
          if (v) onChange({ defaultLanguage: v as Language });
        }}
        allowDeselect={false}
      />
      <Select
        label={t('instance.defaultHomeZone')}
        description={t('instance.defaultsHint')}
        data={zones}
        value={value.defaultHomeTz ?? BROWSER}
        onChange={(v: string | null): void => onChange({ defaultHomeTz: !v || v === BROWSER ? null : v })}
        searchable
        allowDeselect={false}
        limit={50}
      />
      <Radio.Group
        label={t('instance.defaultSecondaryCalendar')}
        description={t('instance.defaultsHint')}
        value={value.defaultSecondaryCalendar}
        onChange={(v: string): void => onChange({ defaultSecondaryCalendar: v as SecondaryCalendar })}
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
