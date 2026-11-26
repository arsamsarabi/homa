// Typed on-screen toasts via @mantine/notifications. LiveRegion still owns the polite live region;
// call `notify` (or announce with toast) for the visible feedback.
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCheck, IconInfoCircle, IconX, type Icon as TablerIcon } from '@tabler/icons-react';
import { createElement, type ReactNode } from 'react';

export type NotifyKind = 'success' | 'error' | 'warning' | 'info';

export type NotifyAppearance = { color: string; Icon: TablerIcon };

const APPEARANCE: Record<NotifyKind, NotifyAppearance> = {
  success: { color: 'teal', Icon: IconCheck },
  error: { color: 'red', Icon: IconX },
  warning: { color: 'yellow', Icon: IconAlertTriangle },
  info: { color: 'blue', Icon: IconInfoCircle },
};

/** Colour + icon for a kind (pure; used by `notify` and unit tests). */
export function notifyAppearance(kind: NotifyKind): NotifyAppearance {
  return APPEARANCE[kind];
}

export type NotifyOptions = {
  /** Stable id so React StrictMode double-effects update one toast instead of stacking two. */
  id?: string;
  title?: string;
  autoClose?: number | false;
};

/** Show a typed Mantine notification (colour + icon per kind). */
export function notify(kind: NotifyKind, message: string, options?: NotifyOptions): string {
  const { color, Icon } = notifyAppearance(kind);
  const icon: ReactNode = createElement(Icon, { size: 18 });
  return notifications.show({
    id: options?.id,
    title: options?.title,
    message,
    color,
    icon,
    autoClose: options?.autoClose ?? 4000,
  });
}

export const notifySuccess = (message: string, options?: NotifyOptions): string => notify('success', message, options);
export const notifyError = (message: string, options?: NotifyOptions): string => notify('error', message, options);
export const notifyWarning = (message: string, options?: NotifyOptions): string => notify('warning', message, options);
export const notifyInfo = (message: string, options?: NotifyOptions): string => notify('info', message, options);
