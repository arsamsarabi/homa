import { Alert, Badge, Button, Group, Loader, Stack, Switch, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type ChangeEvent, type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { useChannelMutations, useChannels } from '@/hooks/reminders';
import { type Channel, type ChannelTest, REMINDER_KINDS } from '@/schemas';
import { useAnnouncer } from '@/stores';
import { type ChannelDraft, ChannelDrawer } from './ChannelDrawer';
import classes from './ChannelsSection.module.css';

/** Email, ntfy, Gotify and webhook channels: where reminders go besides the bell and push. */
export function ChannelsSection(): JSX.Element {
  const { t } = useTranslation();
  const list = useChannels();
  const { update, remove, test } = useChannelMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [draft, setDraft] = useState<ChannelDraft>();
  const [results, setResults] = useState<Record<string, string>>({});

  const which = (c: Channel): string =>
    c.reminderKinds.length === REMINDER_KINDS.length
      ? t('channels.allReminders')
      : c.reminderKinds.map((k) => t(`channels.reminderKinds.${k}`)).join(', ');
  const sendTest = (c: Channel): void =>
    test.mutate(c.id, {
      onSuccess: (r: ChannelTest): void => {
        const msg = r.ok ? t('channels.testSent') : t('channels.testFailed', { message: r.error });
        setResults((s) => ({ ...s, [c.id]: msg }));
        announce(msg, { kind: r.ok ? 'success' : 'error' });
      },
      onError: (err: Error) =>
        setResults((s) => ({ ...s, [c.id]: t('channels.testFailed', { message: err.message }) })),
    });

  return (
    <Stack component="section" gap="xs" aria-labelledby="channel-settings">
      <Group justify="space-between">
        <Title order={2} size="h4" id="channel-settings">
          {t('channels.title')}
        </Title>
        <Button
          size="xs"
          leftSection={<IconPlus size={14} aria-hidden />}
          onClick={(): void => setDraft({ kind: 'create' })}
          disabled={!list.data}
        >
          {t('channels.add')}
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        {t('channels.hint')}
      </Text>
      {list.isPending && <Loader size="sm" aria-label={t('common.loading')} />}
      {list.error && (
        <QueryErrorAlert
          title={t('channels.loadFailed')}
          error={list.error}
          onRetry={(): void => void list.refetch()}
        />
      )}
      {list.data?.items.length === 0 && <Text size="sm">{t('channels.empty')}</Text>}
      <Stack component="ul" gap="sm" className={classes.list} aria-label={t('channels.title')}>
        {list.data?.items.map((c) => (
          <Stack component="li" key={c.id} gap={4} className={classes.item}>
            <Group justify="space-between" wrap="nowrap">
              <Stack gap={0}>
                <Group gap="xs">
                  <Text fw={600}>{c.name}</Text>
                  {c.failing && (
                    <Badge color="red" variant="light">
                      {t('channels.failing')}
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {t(`channels.kinds.${c.kind}`)} · {which(c)}
                </Text>
              </Stack>
              <Switch
                checked={c.enabled}
                onChange={(e: ChangeEvent<HTMLInputElement>): void => {
                  const enabled = e.currentTarget.checked;
                  update.mutate(
                    { id: c.id, enabled },
                    {
                      onSuccess: () =>
                        announce(t(enabled ? 'channels.enabledDone' : 'channels.disabledDone', { name: c.name })),
                    },
                  );
                }}
                aria-label={t('channels.enabledLabel', { name: c.name })}
              />
            </Group>
            {c.failing && c.lastError && (
              <Alert color="red" p="xs">
                <Text size="xs">{t('channels.lastError', { message: c.lastError })}</Text>
              </Alert>
            )}
            <Group gap="xs">
              <Button
                size="xs"
                variant="default"
                loading={test.isPending && test.variables === c.id}
                onClick={(): void => sendTest(c)}
                aria-label={t('channels.testLabel', { name: c.name })}
              >
                {t('channels.test')}
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={(): void => setDraft({ kind: 'edit', channel: c })}
                aria-label={t('channels.editLabel', { name: c.name })}
              >
                {t('channels.edit')}
              </Button>
              <Button
                size="xs"
                variant="light"
                color="red"
                loading={remove.isPending && remove.variables === c.id}
                disabled={remove.isPending && remove.variables === c.id}
                onClick={(): void =>
                  remove.mutate(c.id, { onSuccess: () => announce(t('channels.deleted', { name: c.name })) })
                }
                aria-label={t('channels.deleteLabel', { name: c.name })}
              >
                {t('channels.delete')}
              </Button>
            </Group>
            {results[c.id] && (
              <Text size="xs" role="status">
                {results[c.id]}
              </Text>
            )}
          </Stack>
        ))}
      </Stack>
      <ChannelDrawer
        draft={draft}
        emailAvailable={list.data?.email ?? false}
        onClose={(): void => setDraft(undefined)}
      />
    </Stack>
  );
}
