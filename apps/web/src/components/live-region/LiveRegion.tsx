import { VisuallyHidden } from '@mantine/core';
import { type JSX, useEffect } from 'react';
import { type NotifyKind, notify } from '@/lib/notify';

export type LiveRegionProps = { message: string; id: number; toast: boolean; kind?: NotifyKind };

/** Reads `message` to screen readers; when `toast`, also shows a typed Mantine notification. A new `id` repeats. */
export function LiveRegion({ message, id, toast, kind = 'success' }: LiveRegionProps): JSX.Element {
  useEffect(() => {
    if (!message || !toast) return;
    notify(kind, message, { id: `announce-${id}` });
  }, [id, message, toast, kind]);

  return (
    <VisuallyHidden aria-live="polite" aria-atomic="true">
      <span key={id}>{message}</span>
    </VisuallyHidden>
  );
}
