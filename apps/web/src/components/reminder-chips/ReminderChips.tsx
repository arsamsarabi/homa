import { Chip, Group, Input } from '@mantine/core';
import { type JSX, useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { offsetLabel, reminderChoices, toggleReminder } from '@/services/reminders';

export type ReminderChipsProps = {
  /** Minutes before the start. */
  value: readonly number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
};

/** Toggle chips for an event's reminders: the presets plus any offset it already has (from a sync, say). */
export function ReminderChips({ value, onChange, disabled }: ReminderChipsProps): JSX.Element {
  const { t } = useTranslation();
  const id = useId();
  const choices = useMemo(() => reminderChoices(value), [value]);
  return (
    <Input.Wrapper label={t('reminders.label')} description={t('reminders.hint')} size="xs" id={id}>
      <Group gap={6} mt={4} role="group" aria-labelledby={`${id}-label`}>
        {choices.map((m) => {
          const l = offsetLabel(m);
          return (
            <Chip
              key={m}
              size="xs"
              checked={value.includes(m)}
              disabled={disabled}
              onChange={(): void => onChange(toggleReminder(value, m))}
            >
              {l.key === 'atStart' ? t('reminders.atStart') : t(`reminders.${l.key}`, { count: l.count })}
            </Chip>
          );
        })}
      </Group>
    </Input.Wrapper>
  );
}
