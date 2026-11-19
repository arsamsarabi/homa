import { VisuallyHidden } from '@mantine/core';
import type { JSX } from 'react';

export type LiveRegionProps = { message: string; id: number };

/** Reads `message` to screen readers; a new `id` reads it again even if the text is the same. */
export function LiveRegion({ message, id }: LiveRegionProps): JSX.Element {
  return (
    <VisuallyHidden aria-live="polite" aria-atomic="true">
      <span key={id}>{message}</span>
    </VisuallyHidden>
  );
}
