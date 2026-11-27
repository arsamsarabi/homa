import { ActionIcon, Drawer, Indicator, Popover } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconBell } from '@tabler/icons-react';
import { type JSX, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { NotificationPanel, type NotificationPanelProps } from './NotificationPanel';

export type NotificationBellProps = Omit<NotificationPanelProps, 'headingId'> & {
  unread: number;
  opened: boolean;
  onOpen: () => void;
};

/**
 * The header bell with the unread count. It opens the notification panel: a popover under the bell,
 * or a sheet from the bottom on phones.
 */
export function NotificationBell({ unread, opened, onOpen, ...panel }: NotificationBellProps): JSX.Element {
  const { t } = useTranslation();
  const phone = useMediaQuery('(max-width: 48em)');
  const headingId = useId();
  const label = unread ? t('notifications.bellUnread', { count: unread }) : t('notifications.bell');
  const bell = (
    <Indicator label={unread > 9 ? '9+' : unread} size={16} disabled={unread === 0} offset={4}>
      <ActionIcon
        variant="subtle"
        size="lg"
        onClick={opened ? panel.onClose : onOpen}
        aria-label={label}
        aria-expanded={opened}
        aria-haspopup="dialog"
      >
        <IconBell size={20} aria-hidden />
      </ActionIcon>
    </Indicator>
  );
  if (phone)
    return (
      <>
        {bell}
        <Drawer
          opened={opened}
          onClose={panel.onClose}
          position="bottom"
          size="auto"
          padding="md"
          withCloseButton={false}
          aria-labelledby={headingId}
        >
          <NotificationPanel {...panel} headingId={headingId} />
        </Drawer>
      </>
    );
  return (
    <Popover
      opened={opened}
      onDismiss={panel.onClose}
      position="bottom-end"
      width={380}
      shadow="md"
      radius="md"
      trapFocus
      returnFocus
      // Keep it open even when the bell scrolls out of view (and in tests, which have no layout).
      hideDetached={false}
    >
      <Popover.Target>{bell}</Popover.Target>
      <Popover.Dropdown p={0} role="dialog" aria-labelledby={headingId}>
        <NotificationPanel {...panel} headingId={headingId} />
      </Popover.Dropdown>
    </Popover>
  );
}
