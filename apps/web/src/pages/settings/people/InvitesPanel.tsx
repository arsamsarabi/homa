import { Badge, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconUserPlus } from '@tabler/icons-react';
import { type JSX, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import { useInviteMutations, useInvites } from '@/hooks/people';
import { isolate } from '@/lib/i18n';
import type { Invite } from '@/schemas';
import { inviteStatus } from '@/services/people';
import { useAnnouncer } from '@/stores';
import { InviteDrawer } from './InviteDrawer';
import classes from './PeopleSection.module.css';

const STATUS_COLOR = { pending: 'blue', used: 'green', expired: 'gray' } as const;

/** Invite links: make one, see who joined, revoke the unused ones. */
export function InvitesPanel(): JSX.Element {
  const { t, i18n } = useTranslation();
  const list = useInvites();
  const { revoke } = useInviteMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [open, setOpen] = useState(false);
  const date = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }), [i18n.language]);
  const now = new Date();

  const detail = (invite: Invite): string => {
    const status = inviteStatus(invite, now);
    if (status === 'used') return t('people.invites.joined', { name: isolate(invite.usedBy?.name ?? '') });
    if (status === 'expired') return t('people.invites.expiredOn', { date: date.format(new Date(invite.expiresAt)) });
    return t('people.invites.expires', { date: date.format(new Date(invite.expiresAt)) });
  };

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={3} size="h5">
          {t('people.invites.title')}
        </Title>
        <Button size="xs" leftSection={<IconUserPlus size={14} aria-hidden />} onClick={(): void => setOpen(true)}>
          {t('people.invites.new')}
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        {t('people.invites.hint')}
      </Text>
      {list.isPending && <Loader size="sm" aria-label={t('common.loading')} />}
      {list.error && (
        <QueryErrorAlert
          title={t('people.invites.loadFailed')}
          error={list.error}
          onRetry={(): void => void list.refetch()}
        />
      )}
      {list.data?.length === 0 && <Text size="sm">{t('people.invites.empty')}</Text>}
      <Stack component="ul" gap={0} className={classes.list} aria-label={t('people.invites.title')}>
        {list.data?.map((invite) => {
          const status = inviteStatus(invite, now);
          const who = invite.email ?? t('people.invites.anyone');
          return (
            <Group component="li" key={invite.id} justify="space-between" wrap="nowrap" className={classes.item}>
              <Stack gap={0}>
                <Group gap="xs">
                  <Text fw={600}>{isolate(who)}</Text>
                  <Badge size="sm" variant="light" color={STATUS_COLOR[status]}>
                    {t(`people.invites.status.${status}`)}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  {detail(invite)} · {t('people.invites.by', { name: isolate(invite.createdBy.name) })}
                </Text>
              </Stack>
              {status !== 'used' && (
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  loading={revoke.isPending && revoke.variables === invite.id}
                  disabled={revoke.isPending && revoke.variables === invite.id}
                  onClick={(): void =>
                    revoke.mutate(invite.id, { onSuccess: () => announce(t('people.invites.revoked', { who })) })
                  }
                  aria-label={t('people.invites.revokeLabel', { who })}
                >
                  {t('people.invites.revoke')}
                </Button>
              )}
            </Group>
          );
        })}
      </Stack>
      <InviteDrawer opened={open} onClose={(): void => setOpen(false)} />
    </Stack>
  );
}
