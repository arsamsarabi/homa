import { Anchor, Button, Container, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { useReminderMutations, useReminders } from '@/hooks/reminders';
import { useHomeZone } from '@/hooks/settings';
import type { Reminder } from '@/schemas';
import { repeatOf } from '@/services/event-form';
import { formatWhen } from '@/services/reminders';
import { useAnnouncer } from '@/stores';
import { type ReminderDraft, ReminderDrawer } from './ReminderDrawer';
import classes from './RemindersPage.module.css';

const HOUR = 3_600_000;

/** Standalone reminders: a title and a time, optionally repeating, with no event. */
export function RemindersPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const tz = useHomeZone();
  const list = useReminders();
  const { remove } = useReminderMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [draft, setDraft] = useState<ReminderDraft>();

  const when = (r: Reminder): string =>
    r.nextFireAt ? formatWhen(new Date(r.nextFireAt), false, i18n.language, r.tz) : t('reminders.past');
  const onDelete = (r: Reminder): void =>
    remove.mutate(r.id, {
      onSuccess: () => announce(t('reminders.deleted', { title: r.title })),
      onError: (err: Error) => announce(t('reminders.deleteFailed', { message: err.message }), { kind: 'error' }),
    });

  return (
    <Container size="lg" py="xl">
      <Stack>
        <Anchor component={Link} to="/" size="sm" className={classes.back}>
          <IconArrowLeft size={16} aria-hidden className={classes.arrow} />
          {t('settings.back')}
        </Anchor>
        <Group justify="space-between">
          <Title order={1}>{t('reminders.pageTitle')}</Title>
          <Button
            leftSection={<IconPlus size={16} aria-hidden />}
            onClick={(): void => setDraft({ kind: 'create', at: new Date(Math.ceil(Date.now() / HOUR) * HOUR) })}
          >
            {t('reminders.new')}
          </Button>
        </Group>
        <Text size="sm" c="dimmed">
          {t('reminders.pageHint')}
        </Text>
        {list.isPending && <Loader size="sm" aria-label={t('common.loading')} />}
        {list.error && (
          <QueryErrorAlert
            title={t('reminders.loadFailed')}
            error={list.error}
            onRetry={(): void => void list.refetch()}
          />
        )}
        {list.data?.length === 0 && <Text>{t('reminders.empty')}</Text>}
        <Stack component="ul" gap="sm" className={classes.list} aria-label={t('reminders.pageTitle')}>
          {list.data?.map((r) => (
            <Group key={r.id} component="li" justify="space-between" wrap="nowrap">
              <Stack gap={0}>
                <Text fw={600}>{r.title}</Text>
                <Text size="xs" c="dimmed">
                  {when(r)} · {t(`repeat.${repeatOf(r.rrule)}`)}
                </Text>
              </Stack>
              <Group gap="xs" wrap="nowrap">
                <Button
                  size="xs"
                  variant="default"
                  onClick={(): void => setDraft({ kind: 'edit', reminder: r })}
                  aria-label={t('reminders.editLabel', { title: r.title })}
                >
                  {t('reminders.edit')}
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  onClick={(): void => onDelete(r)}
                  aria-label={t('reminders.deleteLabel', { title: r.title })}
                >
                  {t('reminders.delete')}
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      </Stack>
      <ReminderDrawer draft={draft} tz={tz} onClose={(): void => setDraft(undefined)} />
    </Container>
  );
}
