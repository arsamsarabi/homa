import { Button, Combobox, Group, InputBase, NativeSelect, NumberInput, Popover, Stack, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import {
  type ChangeEvent,
  type FocusEvent,
  type JSX,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useId,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import classes from './AmountPicker.module.css';

/** One choice in the list: a preset, None, or the current value when it isn't a preset. */
export type AmountOption = {
  key: string;
  label: string;
  selected?: boolean;
  /** Shown but not pickable: a reminder already added, or a rule the picker can't build. */
  disabled?: boolean;
  /** Omit for an option that only shows the current value ("Custom rule"). */
  onSelect?: () => void;
};

export type TriggerProps = { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'dialog' };

export type AmountUnit<U extends string> = { value: U; label: (count: number) => string };

export type AmountPickerProps<U extends string> = {
  label?: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** The field's text: the current value as a sentence. */
  valueText: string;
  /** Replaces the field with another button (reminders' "Add reminder"); spread the props onto it. */
  trigger?: (props: TriggerProps) => ReactElement;
  options: readonly AmountOption[];
  units: readonly AmountUnit<U>[];
  /** What the custom row starts with each time the popover opens. */
  initial: { amount: number; unit: U };
  /** Words around the custom row: "Every [3] [weeks]", "[2] [hours] before". */
  prefix?: string;
  suffix?: string;
  /** Smallest amount the row takes (0 for "at start"). */
  min?: number;
  /** The result in words, under the row: "Every 3 weeks". */
  preview: (amount: number, unit: U) => string;
  /** Applies a typed value: returns an error to show, or undefined to close. */
  onCustom: (amount: number, unit: U) => string | undefined;
  submitLabel: string;
  /** More of the custom value under the row, such as weekdays; gets the row's unit. */
  extra?: (unit: U) => ReactNode;
  /** Opening resets anything `extra` keeps. */
  onOpen?: () => void;
  disabled?: boolean;
  /** Leave false inside drawers and popovers, so a click in the picker isn't outside them. */
  withinPortal?: boolean;
};

/** Moves focus between the list's enabled options with the arrow, Home and End keys. */
function moveFocus(e: KeyboardEvent<HTMLFieldSetElement>): void {
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    e.key === 'ArrowDown'
      ? items[(at + 1) % items.length]
      : e.key === 'ArrowUp'
        ? items[(at - 1 + items.length) % items.length]
        : e.key === 'Home'
          ? items[0]
          : e.key === 'End'
            ? items.at(-1)
            : undefined;
  if (!next) return;
  e.preventDefault();
  next.focus();
}

/**
 * A field that opens presets and a "number + unit" row for your own value. The wording comes from
 * the caller, so the same control serves reminders, travel time and repeat.
 */
export function AmountPicker<U extends string>(p: AmountPickerProps<U>): JSX.Element {
  const { t } = useTranslation();
  const id = useId();
  const [opened, setOpened] = useState(false);
  const [amount, setAmount] = useState<number | string>(p.initial.amount);
  const [unit, setUnit] = useState<U>(p.initial.unit);
  const [error, setError] = useState<string>();
  const min = p.min ?? 1;
  const n = typeof amount === 'number' ? amount : Number(amount);
  const valid = amount !== '' && Number.isInteger(n) && n >= min;
  const unitOf = (v: U): AmountUnit<U> | undefined => p.units.find((u) => u.value === v);

  const open = (): void => {
    setAmount(p.initial.amount);
    setUnit(p.initial.unit);
    setError(undefined);
    p.onOpen?.();
    setOpened(true);
  };
  const toggle = (): void => (opened ? setOpened(false) : open());

  const submit = (): void => {
    if (!valid) {
      setError(t('amountPicker.badAmount', { min }));
      return;
    }
    const problem = p.onCustom(n, unit);
    setError(problem);
    if (!problem) setOpened(false);
  };

  const target = p.trigger?.({ onClick: toggle, 'aria-expanded': opened, 'aria-haspopup': 'dialog' }) ?? (
    <InputBase
      component="button"
      type="button"
      pointer
      size="xs"
      label={p.label}
      description={p.description}
      leftSection={p.icon}
      rightSection={<Combobox.Chevron />}
      rightSectionPointerEvents="none"
      disabled={p.disabled}
      aria-haspopup="dialog"
      aria-expanded={opened}
      onClick={toggle}
    >
      {p.valueText}
    </InputBase>
  );
  const firstFocus = p.options.find((o) => o.selected && o.onSelect && !o.disabled) ? 'selected' : 'first';

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width={300}
      shadow="md"
      trapFocus
      returnFocus
      // Stay open while the editor scrolls the field out of view, so typing isn't lost.
      hideDetached={false}
      withinPortal={p.withinPortal ?? false}
      transitionProps={{ duration: 120 }}
    >
      <Popover.Target>{target}</Popover.Target>
      <Popover.Dropdown p={4} aria-label={p.label}>
        <fieldset aria-label={p.label} onKeyDown={moveFocus} className={classes.list}>
          {p.options.map((o, i) => (
            <button
              key={o.key}
              type="button"
              className={classes.option}
              aria-pressed={o.selected ?? false}
              disabled={o.disabled || !o.onSelect}
              data-autofocus={
                (firstFocus === 'selected' ? o.selected && o.onSelect && !o.disabled : i === 0) || undefined
              }
              onClick={(): void => {
                o.onSelect?.();
                setOpened(false);
              }}
            >
              <span>{o.label}</span>
              {o.selected && <IconCheck size={14} stroke={2} className={classes.check} aria-hidden />}
            </button>
          ))}
        </fieldset>
        <fieldset className={classes.custom}>
          <Text component="legend" size="xs" c="dimmed" fw={500} mb={4} className={classes.legend}>
            {t('amountPicker.custom')}
          </Text>
          <Stack gap={6}>
            <Group gap={6} wrap="nowrap" align="center">
              {p.prefix && (
                <Text size="sm" span>
                  {p.prefix}
                </Text>
              )}
              <NumberInput
                size="xs"
                value={amount}
                onChange={(v: number | string): void => {
                  setAmount(v);
                  setError(undefined);
                }}
                onFocus={(e: FocusEvent<HTMLInputElement>): void => e.currentTarget.select()}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>): void => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                }}
                min={min}
                allowDecimal={false}
                allowNegative={false}
                hideControls
                inputMode="numeric"
                w={64}
                aria-label={t('amountPicker.amount')}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : `${id}-preview`}
              />
              <NativeSelect
                size="xs"
                value={unit}
                onChange={(e: ChangeEvent<HTMLSelectElement>): void => {
                  setUnit(e.currentTarget.value as U);
                  setError(undefined);
                }}
                data={p.units.map((u) => ({ value: u.value, label: u.label(valid ? n : 2) }))}
                aria-label={t('amountPicker.unit')}
              />
              {p.suffix && (
                <Text size="sm" span>
                  {p.suffix}
                </Text>
              )}
            </Group>
            {p.extra?.(unit)}
            <Group gap={6} justify="space-between" wrap="nowrap">
              <Text id={`${id}-preview`} size="xs" c="dimmed" aria-live="polite" className={classes.preview}>
                {valid && unitOf(unit) ? p.preview(n, unit) : ''}
              </Text>
              <Button type="button" size="compact-xs" variant="light" onClick={submit}>
                {p.submitLabel}
              </Button>
            </Group>
            {error && (
              <Text id={`${id}-error`} size="xs" c="red" role="alert">
                {error}
              </Text>
            )}
          </Stack>
        </fieldset>
      </Popover.Dropdown>
    </Popover>
  );
}
