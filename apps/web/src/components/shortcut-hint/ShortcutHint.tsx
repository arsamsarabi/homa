import { Kbd } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { JSX } from 'react';
import { useSettings } from '@/hooks/settings';
import { SHORTCUTS, type Shortcut } from '@/services/shortcuts';

/** Hints show unless the user turned them off in Settings, and only where there's a mouse (so likely a keyboard). */
export function useShortcutHints(): boolean {
  const on = useSettings().data?.showShortcutHints ?? true;
  const pointer = useMediaQuery('(hover: hover)', true);
  return on && pointer;
}

/** The key cap for a command, e.g. "C" beside New event. Decorative: the help sheet (?) lists them for everyone. */
export function ShortcutHint({ command }: { command: Shortcut['command'] }): JSX.Element | null {
  const show = useShortcutHints();
  const label = SHORTCUTS.find((s) => s.command === command)?.label;
  if (!show || !label) return null;
  return (
    <Kbd size="xs" aria-hidden>
      {label}
    </Kbd>
  );
}
