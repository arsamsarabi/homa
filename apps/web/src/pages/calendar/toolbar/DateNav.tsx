import { ActionIcon, Group, Stack, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import classes from './DateNav.module.css';

export type DateNavProps = {
  title: string;
  secondaryTitle?: string;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
};

/** Toolbar date control: previous, title (+ optional secondary calendar), next. */
export function DateNav({
  title,
  secondaryTitle,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
}: DateNavProps): JSX.Element {
  return (
    <Group gap={0} className={classes.root} wrap="nowrap">
      <ActionIcon
        variant="subtle"
        size="lg"
        className={classes.chevronBtn}
        onClick={onPrevious}
        aria-label={previousLabel}
      >
        <IconChevronLeft size={18} className={classes.chevron} aria-hidden />
      </ActionIcon>
      <Stack gap={0} className={classes.titles} align="center">
        <Text fw={600} size="sm" lh={1.2} aria-live="polite" className={classes.title}>
          {title}
        </Text>
        {secondaryTitle ? (
          <Text size="xs" c="dimmed" lh={1.2} className={classes.secondary}>
            {secondaryTitle}
          </Text>
        ) : null}
      </Stack>
      <ActionIcon variant="subtle" size="lg" className={classes.chevronBtn} onClick={onNext} aria-label={nextLabel}>
        <IconChevronRight size={18} className={classes.chevron} aria-hidden />
      </ActionIcon>
    </Group>
  );
}
