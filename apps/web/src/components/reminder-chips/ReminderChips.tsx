import { Button, Group, Input, Stack, Text } from '@mantine/core';
import { IconCheck, IconPlus, IconX } from '@tabler/icons-react';
import { type JSX, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { AmountPicker, type TriggerProps } from '@/components/amount-picker';
import {
  addReminder,
  MAX_REMINDERS,
  minutesFromParts,
  offsetLabel,
  REMINDER_PRESETS,
  REMINDER_UNITS,
  type ReminderUnit,
  removeReminder,
} from '@/services/reminders';
import classes from './ReminderChips.module.css';

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

/** Chosen reminders as removable pills (check → X on hover), plus "Add reminder" with presets and your own. */
export function ReminderChips({
  value,
  onChange,
  disabled,
  description,
  atStartLabel,
}: ReminderChipsProps): JSX.Element {
  const { t } = useTranslation();
  const id = useId();
  const atMax = value.length >= MAX_REMINDERS;

  const labelFor = (minutes: number): string => {
    const l = offsetLabel(minutes);
    return l.key === 'atStart' ? (atStartLabel ?? t('reminders.atStart')) : t(`reminders.${l.key}`, { count: l.count });
  };

  const add = (minutes: number): string | undefined => {
    const result = addReminder(value, minutes);
    if (result.ok) {
      onChange(result.value);
      return undefined;
    }
    return result.reason === 'max'
      ? t('reminders.addMax')
      : result.reason === 'duplicate'
        ? t('reminders.addDuplicate')
        : t('reminders.badAmount');
  };

  return (
    <Input.Wrapper label={t('reminders.label')} description={description ?? t('reminders.hint')} size="xs" id={id}>
      <Stack gap={6} mt={4}>
        {value.length > 0 && (
          <Group gap={6} component="ul" aria-label={t('reminders.chosen')} className={classes.list}>
            {value.map((m) => {
              const label = labelFor(m);
              return (
                <li key={m} className={classes.item}>
                  <button
                    type="button"
                    className={classes.pill}
                    disabled={disabled}
                    aria-label={t('reminders.remove', { label })}
                    onClick={(): void => onChange(removeReminder(value, m))}
                  >
                    <span>{label}</span>
                    <span className={classes.icon} aria-hidden>
                      <span className={classes.check}>
                        <IconCheck size={14} stroke={1.75} />
                      </span>
                      <span className={classes.remove}>
                        <IconX size={14} stroke={1.75} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </Group>
        )}
        <AmountPicker<ReminderUnit>
          label={t('reminders.addReminder')}
          valueText=""
          trigger={(props: TriggerProps): JSX.Element => (
            <Button
              {...props}
              type="button"
              size="compact-xs"
              variant="subtle"
              leftSection={<IconPlus size={14} aria-hidden />}
              disabled={disabled || atMax}
              className={classes.add}
            >
              {t('reminders.addReminder')}
            </Button>
          )}
          options={REMINDER_PRESETS.map((m) => {
            const chosen = value.includes(m);
            return {
              key: String(m),
              label: labelFor(m),
              selected: chosen,
              disabled: chosen,
              onSelect: (): void => void add(m),
            };
          })}
          units={REMINDER_UNITS.map((u) => ({ value: u, label: (count: number) => t(`units.${u}`, { count }) }))}
          initial={{ amount: 10, unit: 'minutes' }}
          min={0}
          suffix={t('reminders.before')}
          preview={(n: number, u: ReminderUnit): string => labelFor(minutesFromParts(n, u))}
          onCustom={(n: number, u: ReminderUnit): string | undefined => add(minutesFromParts(n, u))}
          submitLabel={t('reminders.add')}
        />
        {atMax && (
          <Text size="xs" c="dimmed">
            {t('reminders.addMax')}
          </Text>
        )}
      </Stack>
    </Input.Wrapper>
  );
}
