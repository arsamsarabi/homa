// Keyboard shortcuts: one list for the key handlers and the help sheet. Keys are physical (they
// work on any keyboard layout, Farsi included) and never fire while typing in a field.
import type { View } from '@/schemas';

export type CalendarCommand = 'today' | 'previous' | 'next' | 'newEvent' | 'quickAdd' | `view.${View}`;
export type Shortcut = { hotkey: string; label: string; command: CalendarCommand | 'palette' | 'help' };

/** Shown in the help sheet in this order. `label` is what the sheet prints for the key. */
export const SHORTCUTS: readonly Shortcut[] = [
  { hotkey: 'mod+K', label: '⌘K / Ctrl K', command: 'palette' },
  { hotkey: 'shift+slash', label: '?', command: 'help' },
  { hotkey: 'T', label: 'T', command: 'today' },
  { hotkey: 'ArrowLeft', label: '←', command: 'previous' },
  { hotkey: 'ArrowRight', label: '→', command: 'next' },
  { hotkey: 'C', label: 'C', command: 'newEvent' },
  { hotkey: 'Q', label: 'Q', command: 'quickAdd' },
  { hotkey: 'D', label: 'D', command: 'view.day' },
  { hotkey: 'W', label: 'W', command: 'view.week' },
  { hotkey: 'M', label: 'M', command: 'view.month' },
  { hotkey: 'Y', label: 'Y', command: 'view.year' },
  { hotkey: 'A', label: 'A', command: 'view.agenda' },
];

export const CALENDAR_SHORTCUTS: readonly (Shortcut & { command: CalendarCommand })[] = SHORTCUTS.filter(
  (s): s is Shortcut & { command: CalendarCommand } => s.command !== 'palette' && s.command !== 'help',
);

/** In right-to-left layouts the left arrow goes forward in time. */
export function directed(command: CalendarCommand, rtl: boolean): CalendarCommand {
  if (!rtl) return command;
  return command === 'previous' ? 'next' : command === 'next' ? 'previous' : command;
}
