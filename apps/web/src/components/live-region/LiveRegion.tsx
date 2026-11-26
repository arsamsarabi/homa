import { Paper, Text, VisuallyHidden } from '@mantine/core';
import { type JSX, useEffect, useState } from 'react';
import classes from './LiveRegion.module.css';

export type LiveRegionProps = { message: string; id: number; toast: boolean };

const TOAST_MS = 4000;

/** Reads `message` to screen readers; when `toast`, also shows it briefly on screen. A new `id` repeats. */
export function LiveRegion({ message, id, toast }: LiveRegionProps): JSX.Element {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message || !toast) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), TOAST_MS);
    return (): void => window.clearTimeout(timer);
  }, [id, message, toast]);

  return (
    <>
      <VisuallyHidden aria-live="polite" aria-atomic="true">
        <span key={id}>{message}</span>
      </VisuallyHidden>
      {visible && message && (
        <Paper
          className={classes.toast}
          shadow="sm"
          withBorder
          px="md"
          py="sm"
          data-testid="announcer-toast"
          aria-hidden
        >
          <Text size="sm">{message}</Text>
        </Paper>
      )}
    </>
  );
}
