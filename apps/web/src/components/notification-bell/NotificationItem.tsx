import {
  ActionIcon,
  Group,
  Menu,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core';
import {
  IconAlarm,
  IconCalendarEvent,
  IconCalendarQuestion,
  IconCheck,
  IconChecklist,
  IconClockPause,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { Notification } from '@/schemas';
import { SNOOZES, type Snooze } from '@/services/reminders';
import classes from './NotificationBell.module.css';

const KIND = {
  event: { Icon: IconCalendarEvent, color: 'blue' },
  task: { Icon: IconChecklist, color: 'teal' },
  standalone: { Icon: IconAlarm, color: 'grape' },
  poll: { Icon: IconCalendarQuestion, color: 'orange' },
} as const;

export type NotificationItemProps = {
  notification: Notification;
  /** New since the panel opened: a dot and bold title. */
  isNew: boolean;
  when: string;
  onOpen: () => void;
  onSnooze: (snooze: Snooze) => void;
  onDone: () => void;
};

/** One notification: what it is and when, opening it, and snooze and done beside it. */
export function NotificationItem({
  notification: n,
  isNew,
  when,
  onOpen,
  onSnooze,
  onDone,
}: NotificationItemProps): JSX.Element {
  const { t } = useTranslation();
  const { Icon, color } = KIND[n.kind];
  const title = n.title || t('notifications.untitled');
  return (
    <li className={classes.item} data-new={isNew || undefined}>
      <UnstyledButton className={classes.open} onClick={onOpen}>
        <ThemeIcon variant="light" color={color} radius="xl" size={32} aria-hidden>
          <Icon size={18} />
        </ThemeIcon>
        <Stack gap={2} miw={0}>
          <Text size="sm" fw={isNew ? 700 : 500} lineClamp={2}>
            {isNew && <VisuallyHidden>{t('notifications.new')}: </VisuallyHidden>}
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            <VisuallyHidden>{t(`notifications.kind.${n.kind}`)}, </VisuallyHidden>
            {when}
          </Text>
        </Stack>
      </UnstyledButton>
      <Group gap={2} wrap="nowrap" className={classes.actions}>
        <Menu position="bottom-end" withinPortal={false}>
          <Menu.Target>
            <Tooltip label={t('notifications.snooze')}>
              <ActionIcon variant="subtle" color="gray" aria-label={t('notifications.snoozeLabel', { title })}>
                <IconClockPause size={18} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{t('notifications.snoozeMenu')}</Menu.Label>
            {SNOOZES.map((s) => (
              <Menu.Item key={s} onClick={(): void => onSnooze(s)}>
                {t(`notifications.snoozeFor.${s}`)}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        <Tooltip label={t(n.kind === 'task' ? 'notifications.completeTask' : 'notifications.done')}>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={onDone}
            aria-label={t(n.kind === 'task' ? 'notifications.completeLabel' : 'notifications.doneLabel', { title })}
          >
            <IconCheck size={18} aria-hidden />
          </ActionIcon>
        </Tooltip>
      </Group>
    </li>
  );
}
