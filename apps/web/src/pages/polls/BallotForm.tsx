import { ActionIcon, Button, Group, Paper, Stack, Switch, Text, ThemeIcon, Title } from '@mantine/core';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { type ChangeEvent, type JSX, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePollMutations, usePollPrefill } from '@/hooks/polls';
import { useHomeZone } from '@/hooks/settings';
import type { Poll } from '@/schemas';
import { type Ballot, cannot, move, rank, slotLabel, startBallot, unrank } from '@/services/polls';
import { useAnnouncer } from '@/stores';
import classes from './PollsPage.module.css';

/** Your answer: the times you can make in order, best first, and the ones you can't. */
export function BallotForm({ poll }: { poll: Poll }): JSX.Element {
  const { t, i18n } = useTranslation();
  const tz = useHomeZone();
  const me = poll.participants.find((x) => x.id === poll.me.participantId);
  const prefill = usePollPrefill(poll.id, !me?.responded);
  const { answer } = usePollMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [ballot, setBallot] = useState<Ballot>(() => startBallot(poll, prefill.data));
  const [holds, setHolds] = useState(me?.holds ?? false);
  const [dirty, setDirty] = useState(false);
  // Once the clashes arrive, they start under can't (until you've changed something).
  useEffect(() => {
    if (!dirty) setBallot(startBallot(poll, prefill.data));
  }, [prefill.data, poll.id]);

  const slot = (id: string): string => {
    const s = poll.slots.find((x) => x.id === id);
    return s ? slotLabel(s.start, s.end, i18n.language, tz) : id;
  };
  const change = (next: Ballot): void => {
    setDirty(true);
    setBallot(next);
  };
  const clashes = new Set(prefill.data ?? []);
  const zoneHint = poll.tz !== tz ? t('polls.zoneHint', { tz: poll.tz }) : undefined;

  const save = (): void =>
    answer.mutate(
      { id: poll.id, ranked: ballot.ranked, cannot: ballot.cannot, holds },
      {
        onSuccess: (): void => {
          setDirty(false);
          announce(t('polls.answerSaved'));
        },
        onError: (err: Error): void => announce(t('polls.actionFailed', { message: err.message }), { kind: 'error' }),
      },
    );

  const group = (title: string, ids: string[], row: (id: string, i: number) => JSX.Element): JSX.Element => (
    <Stack gap="xs">
      <Title order={3} size="h5">
        {title}
      </Title>
      {ids.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('polls.groupEmpty')}
        </Text>
      ) : (
        <Stack component="ul" gap="xs" className={classes.list} aria-label={title}>
          {ids.map((id, i) => (
            <Paper component="li" withBorder p="xs" key={id} mih={48}>
              {row(id, i)}
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );

  return (
    <Stack>
      <Text>{t('polls.ballotHint')}</Text>
      {zoneHint && (
        <Text size="sm" c="dimmed">
          {zoneHint}
        </Text>
      )}
      {group(t('polls.yourOrder'), ballot.ranked, (id, i) => (
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon radius="xl" size="sm" aria-hidden>
              <Text size="xs" fw={700}>
                {i + 1}
              </Text>
            </ThemeIcon>
            <Text size="sm">{slot(id)}</Text>
          </Group>
          <Group gap={4} wrap="nowrap">
            <ActionIcon
              variant="subtle"
              aria-label={t('polls.moveUp', { time: slot(id) })}
              disabled={i === 0}
              onClick={(): void => {
                change(move(ballot, id, -1));
                announce(t('polls.moved', { time: slot(id), n: i, count: ballot.ranked.length }));
              }}
            >
              <IconArrowUp size={16} aria-hidden />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              aria-label={t('polls.moveDown', { time: slot(id) })}
              disabled={i === ballot.ranked.length - 1}
              onClick={(): void => {
                change(move(ballot, id, 1));
                announce(t('polls.moved', { time: slot(id), n: i + 2, count: ballot.ranked.length }));
              }}
            >
              <IconArrowDown size={16} aria-hidden />
            </ActionIcon>
            <Button size="xs" variant="subtle" color="gray" onClick={(): void => change(cannot(ballot, id))}>
              {t('polls.cant')}
            </Button>
          </Group>
        </Group>
      ))}
      {group(t('polls.unranked'), ballot.unranked, (id) => (
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">{slot(id)}</Text>
          <Group gap={4} wrap="nowrap">
            <Button size="xs" variant="light" onClick={(): void => change(rank(ballot, id))}>
              {t('polls.rank')}
            </Button>
            <Button size="xs" variant="subtle" color="gray" onClick={(): void => change(cannot(ballot, id))}>
              {t('polls.cant')}
            </Button>
          </Group>
        </Group>
      ))}
      {group(t('polls.cannot'), ballot.cannot, (id) => (
        <Group justify="space-between" wrap="nowrap">
          <Stack gap={0}>
            <Text size="sm">{slot(id)}</Text>
            {clashes.has(id) && (
              <Text size="xs" c="dimmed">
                {t('polls.busyHint')}
              </Text>
            )}
          </Stack>
          <Button size="xs" variant="subtle" onClick={(): void => change(unrank(ballot, id))}>
            {t('polls.canMake')}
          </Button>
        </Group>
      ))}
      <Group justify="space-between">
        <Switch
          label={t('polls.holdMine')}
          checked={holds}
          onChange={(e: ChangeEvent<HTMLInputElement>): void => {
            setDirty(true);
            setHolds(e.currentTarget.checked);
          }}
        />
        <Button onClick={save} loading={answer.isPending}>
          {t('polls.save')}
        </Button>
      </Group>
    </Stack>
  );
}
