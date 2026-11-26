import { Button, Chip, Group, Input, NativeSelect, NumberInput, Stack, Text } from '@mantine/core';
import { type ChangeEvent, type JSX, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addReminder,
  MAX_REMINDERS,
  minutesFromParts,
  offsetLabel,
  REMINDER_UNITS,
  type ReminderUnit,
  removeReminder,
} from '@/services/reminders';

export type ReminderChipsProps = {
  /** Minutes before the start. */
  value: readonly number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
  /** Replaces the hint under the label (an event's "for every occurrence"). */
  description?: string;
  /** Replaces "At start" (a task's "At due time"). */
  atStartLabel?: string;
};

/** Chosen reminders as removable chips, plus a number + unit row to add more. */
export function ReminderChips({
  value,
  onChange,
  disabled,
  description,
  atStartLabel,
}: ReminderChipsProps): JSX.Element {
  const { t } = useTranslation();
  const id = useId();
  const [count, setCount] = useState<number | string>(10);
  const [unit, setUnit] = useState<ReminderUnit>('minutes');
  const [error, setError] = useState<string>();
  const atMax = value.length >= MAX_REMINDERS;

  const labelFor = (minutes: number): string => {
    const l = offsetLabel(minutes);
    return l.key === 'atStart' ? (atStartLabel ?? t('reminders.atStart')) : t(`reminders.${l.key}`, { count: l.count });
  };

  const add = (): void => {
    const n = typeof count === 'number' ? count : Number(count);
    if (!Number.isInteger(n) || n < 0) {
      setError(t('reminders.badAmount'));
      return;
    }
    const result = addReminder(value, minutesFromParts(n, unit));
    if (!result.ok) {
      setError(
        result.reason === 'max'
          ? t('reminders.addMax')
          : result.reason === 'duplicate'
            ? t('reminders.addDuplicate')
            : t('reminders.badAmount'),
      );
      return;
    }
    setError(undefined);
    onChange(result.value);
  };

  return (
    <Input.Wrapper label={t('reminders.label')} description={description ?? t('reminders.hint')} size="xs" id={id}>
      <Stack gap={6} mt={4}>
        {value.length > 0 && (
          <Group gap={6} role="list" aria-label={t('reminders.chosen')}>
            {value.map((m) => (
              <Chip
                key={m}
                size="xs"
                checked
                disabled={disabled}
                onChange={(): void => onChange(removeReminder(value, m))}
              >
                {labelFor(m)}
              </Chip>
            ))}
          </Group>
        )}
        <Group gap={6} align="flex-end" wrap="nowrap">
          <NumberInput
            size="xs"
            label={t('reminders.amount')}
            value={count}
            onChange={setCount}
            min={0}
            max={999}
            allowDecimal={false}
            disabled={disabled || atMax}
            w={88}
            aria-label={t('reminders.amount')}
          />
          <NativeSelect
            size="xs"
            label={t('reminders.unit')}
            value={unit}
            onChange={(e: ChangeEvent<HTMLSelectElement>): void => setUnit(e.currentTarget.value as ReminderUnit)}
            data={REMINDER_UNITS.map((u) => ({ value: u, label: t(`reminders.unit_${u}`) }))}
            disabled={disabled || atMax}
            aria-label={t('reminders.unit')}
          />
          <Button type="button" size="xs" variant="light" disabled={disabled || atMax} onClick={add}>
            {t('reminders.add')}
          </Button>
        </Group>
        {error && (
          <Text size="xs" c="red" role="alert">
            {error}
          </Text>
        )}
        {atMax && !error && (
          <Text size="xs" c="dimmed">
            {t('reminders.addMax')}
          </Text>
        )}
      </Stack>
    </Input.Wrapper>
  );
}
