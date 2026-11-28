import { Alert, Badge, Button, Container, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useNavigate, useParams } from '@tanstack/react-router';
import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageBreadcrumbs, QueryErrorAlert } from '@/components';
import { usePoll, usePollMutations } from '@/hooks/polls';
import { useHomeZone } from '@/hooks/settings';
import type { Poll } from '@/schemas';
import { travelDuration } from '@/services/event-form';
import { slotLabel } from '@/services/polls';
import { formatWhen } from '@/services/reminders';
import { useAnnouncer } from '@/stores';
import { BallotForm } from './BallotForm';
import { FinalizeModal } from './FinalizeModal';
import { PollEditor } from './PollEditor';
import { PollResults } from './PollResults';

/** One poll: your ballot while it's open, the results, and the organizer's actions. */
export function PollPage(): JSX.Element {
  const { t } = useTranslation();
  const { pollId } = useParams({ from: '/_app/polls/$pollId' });
  const poll = usePoll(pollId);
  return (
    <Container size="lg" py="xl">
      <Stack>
        <PageBreadcrumbs trail={[{ label: t('polls.title'), href: '/polls' }, { label: poll.data?.title ?? '' }]} />
        {poll.isPending && <Loader size="sm" aria-label={t('common.loading')} />}
        {poll.error && (
          <QueryErrorAlert title={t('polls.loadFailed')} error={poll.error} onRetry={(): void => void poll.refetch()} />
        )}
        {poll.data && <PollDetails poll={poll.data} />}
      </Stack>
    </Container>
  );
}

function PollDetails({ poll }: { poll: Poll }): JSX.Element {
  const { t, i18n } = useTranslation();
  const tz = useHomeZone();
  const navigate = useNavigate();
  const m = usePollMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<string>();
  const organizer = poll.me.organizer;
  const responded = poll.participants.filter((x) => x.responded).length;
  const final = poll.slots.find((s) => s.id === poll.finalSlotId);
  const fail = (err: Error): void => announce(t('polls.actionFailed', { message: err.message }), { kind: 'error' });
  const say = (key: string) => (): void => announce(t(key, { title: poll.title }));

  const status =
    poll.status === 'finalized' && final
      ? t('polls.status.setFor', { when: slotLabel(final.start, final.end, i18n.language, tz) })
      : t(`polls.status.${poll.status}`);

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Title order={1}>{poll.title}</Title>
          <Text c="dimmed" size="sm">
            {[
              organizer ? t('polls.youAsk') : t('polls.asks', { name: poll.organizer.name }),
              travelDuration(poll.durationMinutes, i18n.language),
              poll.location,
              poll.deadline && poll.status === 'open'
                ? t('polls.answerBy', { when: formatWhen(new Date(poll.deadline), false, i18n.language, tz) })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Stack>
        <Group gap="xs">
          <Badge variant="light">{status}</Badge>
          <Text size="sm" c="dimmed">
            {t('polls.answered', { n: responded, count: poll.participants.length })}
          </Text>
        </Group>
      </Group>
      {poll.description && <Text style={{ whiteSpace: 'pre-wrap' }}>{poll.description}</Text>}

      {organizer && (
        <Group gap="xs">
          {(poll.status === 'draft' || poll.status === 'open' || poll.status === 'closed') && (
            <Button variant="default" onClick={(): void => setEditing(true)}>
              {t('polls.edit')}
            </Button>
          )}
          {poll.status === 'draft' && (
            <Button onClick={(): void => m.open.mutate(poll.id, { onSuccess: say('polls.sent'), onError: fail })}>
              {t('polls.send')}
            </Button>
          )}
          {poll.status === 'open' && (
            <Button
              variant="default"
              onClick={(): void => m.close.mutate(poll.id, { onSuccess: say('polls.closedNow'), onError: fail })}
            >
              {t('polls.close')}
            </Button>
          )}
          {poll.status === 'closed' && (
            <Button
              variant="default"
              onClick={(): void =>
                m.reopen.mutate({ id: poll.id, deadline: null }, { onSuccess: say('polls.reopened'), onError: fail })
              }
            >
              {t('polls.reopen')}
            </Button>
          )}
          <Button
            variant="light"
            color="red"
            onClick={(): void =>
              m.remove.mutate(poll.id, {
                onSuccess: (): void => {
                  announce(
                    t(poll.status === 'open' || poll.status === 'closed' ? 'polls.cancelled' : 'polls.deleted', {
                      title: poll.title,
                    }),
                  );
                  void navigate({ to: '/polls' });
                },
                onError: fail,
              })
            }
          >
            {poll.status === 'open' || poll.status === 'closed' ? t('polls.cancel') : t('polls.delete')}
          </Button>
        </Group>
      )}

      {poll.status === 'cancelled' && <Alert color="gray">{t('polls.cancelledNote')}</Alert>}
      {poll.status === 'finalized' && final && (
        <Alert color="green">
          {t('polls.finalNote', { when: slotLabel(final.start, final.end, i18n.language, tz) })}
        </Alert>
      )}
      {poll.me.participantId && poll.status === 'open' && <BallotForm poll={poll} />}
      {poll.status !== 'draft' && (
        <PollResults
          poll={poll}
          onPick={organizer && (poll.status === 'open' || poll.status === 'closed') ? setPicking : undefined}
        />
      )}
      {poll.status === 'draft' && <Text c="dimmed">{t('polls.draftNote', { count: poll.slots.length })}</Text>}

      <PollEditor
        opened={editing}
        poll={poll}
        onClose={(): void => setEditing(false)}
        onSaved={(): void => setEditing(false)}
      />
      <FinalizeModal poll={poll} slotId={picking} onClose={(): void => setPicking(undefined)} />
    </Stack>
  );
}
