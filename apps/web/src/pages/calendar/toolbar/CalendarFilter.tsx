import { Anchor, Badge, Button, Checkbox, Divider, Group, Popover, Stack, Text } from '@mantine/core';
import { IconStack2 } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { ChangeEvent, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarUpdate } from '@/hooks/calendar';
import { useCalendarPageModel } from '@/pages/calendar/model';
import type { Calendar } from '@/schemas';

/** Shows or hides each calendar's events in the views. The choice is saved, so it follows you across devices. */
export function CalendarFilter(): JSX.Element {
  const { t } = useTranslation();
  const { calendars } = useCalendarPageModel();
  const update = useCalendarUpdate();
  const hidden = calendars.filter((c) => c.hidden);
  const groups = [
    { key: 'mine', label: t('calendars.mine'), list: calendars.filter((c) => !c.connectionId) },
    { key: 'other', label: t('calendars.other'), list: calendars.filter((c) => c.connectionId) },
  ].filter((g) => g.list.length > 0);
  const set = (c: Calendar, visible: boolean): void => update.mutate({ id: c.id, hidden: !visible });

  return (
    <Popover position="bottom-end" shadow="md" withArrow withinPortal={false}>
      <Popover.Target>
        <Button
          variant="default"
          leftSection={<IconStack2 size={16} aria-hidden />}
          rightSection={
            hidden.length > 0 && (
              <Badge size="sm" variant="light" circle aria-hidden>
                {hidden.length}
              </Badge>
            )
          }
          aria-label={hidden.length > 0 ? t('calendars.filterHidden', { count: hidden.length }) : t('calendars.filter')}
        >
          {t('calendars.filter')}
        </Button>
      </Popover.Target>
      <Popover.Dropdown miw={240} maw={320}>
        <Stack gap="sm">
          {groups.map((g) => (
            <Stack key={g.key} gap={6} role="group" aria-label={g.label}>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                {g.label}
              </Text>
              {g.list.map((c) => (
                <Checkbox
                  key={c.id}
                  label={c.name}
                  checked={!c.hidden}
                  color={c.color}
                  autoContrast
                  onChange={(e: ChangeEvent<HTMLInputElement>): void => set(c, e.currentTarget.checked)}
                />
              ))}
            </Stack>
          ))}
          {update.isError && (
            <Text size="xs" c="red" role="alert">
              {t('calendars.saveFailed', { message: update.error.message })}
            </Text>
          )}
          <Divider />
          <Group justify="space-between" gap="xs">
            <Button
              size="compact-xs"
              variant="subtle"
              disabled={hidden.length === 0}
              onClick={() => {
                for (const c of hidden) set(c, true);
              }}
            >
              {t('calendars.showAll')}
            </Button>
            <Anchor component={Link} to="/settings" size="xs">
              {t('calendars.manage')}
            </Anchor>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
