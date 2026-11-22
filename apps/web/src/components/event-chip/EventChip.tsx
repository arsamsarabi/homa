import { UnstyledButton, VisuallyHidden } from '@mantine/core';
import type { CSSProperties, JSX, MouseEventHandler, PointerEventHandler } from 'react';
import classes from './EventChip.module.css';

export type EventChipProps = {
  title: string;
  color: string | undefined;
  /** 'chip' (filled, for all-day events) or 'line' (a dot, for timed events in a month cell). */
  variant: 'chip' | 'line';
  time?: string;
  /** A finished task's time block: struck through, with `done` read out. */
  done?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
};

/** One event as a small button in a list or cell. */
export function EventChip({ title, color, variant, time, done, onClick, onPointerDown }: EventChipProps): JSX.Element {
  return (
    <UnstyledButton
      className={variant === 'chip' ? classes.chip : classes.line}
      style={{ '--c': color } as CSSProperties}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      {time && <span className={classes.time}>{time}</span>}
      {done ? <s>{title}</s> : title}
      {done && <VisuallyHidden>{done}</VisuallyHidden>}
    </UnstyledButton>
  );
}
