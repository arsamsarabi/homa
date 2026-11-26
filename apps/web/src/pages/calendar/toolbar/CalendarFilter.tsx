import { Anchor, Badge, Button, Checkbox, Divider, Group, Popover, Stack, Text } from '@mantine/core';
import { IconStack2 } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import type { ChangeEvent, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarUpdate } from '@/hooks/calendar';
import { useConnections } from '@/hooks/connections';
import { useCalendarPageModel } from '@/pages/calendar/model';
import type { Calendar, Connection } from '@/schemas';
import { groupSharedByOwner } from '@/services/calendar-sharing';
import { useAnnouncer } from '@/stores';

// CalDAV accounts are labeled "<user> on <host>"; well-known hosts get their service's name.
const CALDAV_HOSTS: [RegExp, string][] = [
  [/icloud\.com$/, 'iCloud'],
  [/fastmail\.com$/, 'Fastmail'],
  [/mailbox\.org$/, 'mailbox.org'],
  [/posteo\.de$/, 'Posteo'],
  [/(^|\.)zoho\.[a-z.]+$/, 'Zoho Calendar'],
];

/** A connected account's group heading: the provider, and the account in its own case (e.g. Google, ada@example.com). */
const accountHeading = (k: Connection, t: TFunction): { provider: string; account: string | null } => {
  const caldav = k.provider === 'caldav' ? /^(.*) on (\S+)$/.exec(k.label ?? '') : null;
  if (caldav) {
    const [, user = '', host = ''] = caldav;
    return { provider: CALDAV_HOSTS.find(([re]) => re.test(host))?.[1] ?? host, account: user };
  }
  return { provider: t(`calendars.groups.${k.provider}`), account: k.label };
};

type FilterGroup = { key: string; label: string; account: string | null; list: Calendar[] };

/** Shows or hides each calendar's events in the views. The choice is saved, so it follows you across devices. */
export function CalendarFilter(): JSX.Element {
  const { t } = useTranslation();
  const { calendars } = useCalendarPageModel();
  const update = useCalendarUpdate();
  const announce = useAnnouncer((s) => s.announce);
  const hidden = calendars.filter((c) => c.hidden);
  const connections = useConnections().data ?? [];
  const owned = calendars.filter((c) => c.access === 'owner');
  const inConnection = (ids: ReadonlySet<string>): Calendar[] =>
    owned.filter((c) => c.connectionId && ids.has(c.connectionId));
  // Your own calendars (by connection), then shared calendars grouped by owner ("Shared by Ada").
  const groups: FilterGroup[] = [
    { key: 'mine', label: t('calendars.mine'), account: null, list: owned.filter((c) => !c.connectionId) },
    ...connections
      .filter((k) => k.provider !== 'ics')
      .map((k) => {
        const { provider, account } = accountHeading(k, t);
        return { key: k.id, label: provider, account, list: inConnection(new Set([k.id])) };
      }),
    {
      key: 'feeds',
      label: t('calendars.groups.feeds'),
      account: null,
      list: inConnection(new Set(connections.filter((k) => k.provider === 'ics').map((k) => k.id))),
    },
    ...groupSharedByOwner(calendars).map((g) => ({
      key: `shared:${g.ownerId}`,
      label: t('calendars.sharedBy', { name: g.ownerName }),
      account: null,
      list: g.calendars,
    })),
  ].filter((g) => g.list.length > 0);
  const set = (c: Calendar, visible: boolean): void =>
    update.mutate(
      { id: c.id, hidden: !visible },
      { onSuccess: () => announce(t(visible ? 'calendars.shown' : 'calendars.hiddenDone', { name: c.name })) },
    );

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
            <Stack key={g.key} gap={6} role="group" aria-label={g.account ? `${g.label} · ${g.account}` : g.label}>
              <Text size="xs" fw={600} c="dimmed" truncate title={g.account ?? undefined}>
                <Text span inherit tt="uppercase">
                  {g.label}
                </Text>
                {g.account && ` · ${g.account}`}
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
