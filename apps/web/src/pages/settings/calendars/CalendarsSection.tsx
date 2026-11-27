import { ActionIcon, Alert, Group, Loader, Paper, Stack, Text, Title, Tooltip } from '@mantine/core';
import { IconEye, IconEyeOff, IconPencil } from '@tabler/icons-react';
import { type JSX, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { useCalendars, useCalendarUpdate } from '@/hooks/calendar';
import type { Calendar } from '@/schemas';
import { groupSharedByOwner } from '@/services/calendar-sharing';
import { useAnnouncer } from '@/stores';
import { CalendarColorButton } from './CalendarColorButton';
import { CalendarEditDrawer } from './CalendarEditDrawer';
import classes from './CalendarsSection.module.css';

/** Settings section: every calendar, with its color, whether it shows in the views, and renaming. */
export function CalendarsSection(): JSX.Element {
  const { t } = useTranslation();
  const headingId = useId();
  const calendars = useCalendars();
  const update = useCalendarUpdate();
  const announce = useAnnouncer((s) => s.announce);
  const [editing, setEditing] = useState<Calendar>();
  const owned = useMemo((): Calendar[] => (calendars.data ?? []).filter((c) => c.access === 'owner'), [calendars.data]);
  const sharedGroups = useMemo(() => groupSharedByOwner(calendars.data ?? []), [calendars.data]);

  const recolor = (c: Calendar, color: string): void =>
    update.mutate({ id: c.id, color }, { onSuccess: () => announce(t('connections.calendarSaved')) });
  const toggle = (c: Calendar): void =>
    update.mutate(
      { id: c.id, hidden: !c.hidden },
      { onSuccess: () => announce(t(c.hidden ? 'calendars.shown' : 'calendars.hiddenDone', { name: c.name })) },
    );

  const row = (c: Calendar, opts: { canEdit: boolean; subtitle: string }): JSX.Element => (
    <Paper key={c.id} withBorder p="xs" radius="md" component="li" aria-label={c.name}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" miw={0}>
          {/* Recoloring a shared calendar changes only your own view of it. */}
          <CalendarColorButton name={c.name} color={c.color} onPick={(color: string): void => recolor(c, color)} />
          <Stack gap={0} miw={0}>
            <Text truncate c={c.hidden ? 'dimmed' : undefined}>
              {c.name}
            </Text>
            <Text size="xs" c="dimmed">
              {opts.subtitle}
              {c.hidden && ` · ${t('calendars.hiddenLabel')}`}
            </Text>
          </Stack>
        </Group>
        <Group gap={4} wrap="nowrap">
          <Tooltip label={t(c.hidden ? 'calendars.show' : 'calendars.hide', { name: c.name })}>
            <ActionIcon
              variant="subtle"
              onClick={(): void => toggle(c)}
              aria-label={t(c.hidden ? 'calendars.show' : 'calendars.hide', { name: c.name })}
            >
              {c.hidden ? <IconEyeOff size={16} aria-hidden /> : <IconEye size={16} aria-hidden />}
            </ActionIcon>
          </Tooltip>
          {opts.canEdit && (
            <ActionIcon
              variant="subtle"
              onClick={(): void => setEditing(c)}
              aria-label={t('connections.editCalendar', { name: c.name })}
            >
              <IconPencil size={16} aria-hidden />
            </ActionIcon>
          )}
        </Group>
      </Group>
    </Paper>
  );

  return (
    <Stack component="section" aria-labelledby={headingId}>
      <Title order={2} size="h3" id={headingId}>
        {t('calendars.title')}
      </Title>
      <Text size="sm" c="dimmed">
        {t('calendars.hint')}
      </Text>
      {calendars.isPending && <Loader size="sm" aria-label={t('calendars.loading')} />}
      {calendars.isError && (
        <QueryErrorAlert
          title={t('calendars.loadFailed')}
          error={calendars.error}
          onRetry={() => void calendars.refetch()}
        />
      )}
      {update.isError && (
        <Alert color="red" role="alert">
          {t('calendars.saveFailed', { message: update.error.message })}
        </Alert>
      )}
      {calendars.data && (
        <Stack gap="md">
          <Stack component="ul" gap="xs" className={classes.list}>
            {owned.map((c) =>
              row(c, {
                canEdit: true,
                subtitle: c.connectionId ? t('calendars.connected') : t('calendars.yours'),
              }),
            )}
          </Stack>
          {sharedGroups.map((g) => (
            <Stack key={g.ownerId} gap="xs">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                {t('calendars.sharedBy', { name: g.ownerName })}
              </Text>
              <Stack component="ul" gap="xs" className={classes.list}>
                {g.calendars.map((c) =>
                  row(c, {
                    canEdit: false,
                    subtitle: t(`sharing.level.${c.access}`),
                  }),
                )}
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
      <CalendarEditDrawer calendar={editing} onClose={() => setEditing(undefined)} />
    </Stack>
  );
}
