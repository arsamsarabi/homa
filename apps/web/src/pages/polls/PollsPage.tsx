import { Badge, Button, Card, Container, Group, Loader, Stack, Tabs, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageBreadcrumbs, PageTabs, QueryErrorAlert } from '@/components';
import { usePolls } from '@/hooks/polls';
import { useHomeZone } from '@/hooks/settings';
import { POLL_TABS, type PollSummary, type PollTab } from '@/schemas';
import { formatWhen } from '@/services/reminders';
import { PollEditor } from './PollEditor';
import classes from './PollsPage.module.css';

/** Polls: the ones you're asked to answer, the ones you run, and finished ones. */
export function PollsPage(): JSX.Element {
  const { t } = useTranslation();
  const search = useSearch({ from: '/_app/polls/' });
  const navigate = useNavigate();
  const answer = usePolls('answer');
  const [creating, setCreating] = useState(false);
  // To answer is the default when it has something in it.
  const tab: PollTab = search.tab ?? (answer.data && answer.data.length === 0 ? 'mine' : 'answer');
  const pick = (next: PollTab): void => void navigate({ to: '/polls', search: { tab: next }, replace: true });

  return (
    <Container size="lg" py="xl">
      <Stack>
        <PageBreadcrumbs trail={[{ label: t('polls.title') }]} />
        <Group justify="space-between">
          <Title order={1}>{t('polls.title')}</Title>
          <Button leftSection={<IconPlus size={16} aria-hidden />} onClick={(): void => setCreating(true)}>
            {t('polls.new')}
          </Button>
        </Group>
        <PageTabs
          tabs={POLL_TABS}
          value={tab}
          onChange={pick}
          label={(x: PollTab): string =>
            x === 'answer' && answer.data?.length
              ? `${t('polls.tabs.answer')} (${answer.data.length})`
              : t(`polls.tabs.${x}`)
          }
        >
          {POLL_TABS.map((x) => (
            <Tabs.Panel key={x} value={x}>
              <PollList view={x} onNew={(): void => setCreating(true)} />
            </Tabs.Panel>
          ))}
        </PageTabs>
      </Stack>
      <PollEditor
        opened={creating}
        onClose={(): void => setCreating(false)}
        onSaved={(id: string): void => {
          setCreating(false);
          void navigate({ to: '/polls/$pollId', params: { pollId: id } });
        }}
      />
    </Container>
  );
}

function PollList({ view, onNew }: { view: PollTab; onNew: () => void }): JSX.Element {
  const { t } = useTranslation();
  const list = usePolls(view);
  if (list.isPending) return <Loader size="sm" aria-label={t('common.loading')} />;
  if (list.error)
    return (
      <QueryErrorAlert title={t('polls.loadFailed')} error={list.error} onRetry={(): void => void list.refetch()} />
    );
  if (!list.data.length)
    return (
      <Stack align="flex-start" gap="xs">
        <Text>{t(`polls.empty.${view}`)}</Text>
        {view === 'mine' && (
          <Button variant="light" onClick={onNew}>
            {t('polls.new')}
          </Button>
        )}
      </Stack>
    );
  return (
    <Stack component="ul" gap="sm" className={classes.list} aria-label={t(`polls.tabs.${view}`)}>
      {list.data.map((p) => (
        <li key={p.id}>
          <PollCard poll={p} />
        </li>
      ))}
    </Stack>
  );
}

function PollCard({ poll: p }: { poll: PollSummary }): JSX.Element {
  const { t, i18n } = useTranslation();
  const tz = useHomeZone();
  const when = (iso: string): string => formatWhen(new Date(iso), false, i18n.language, tz);
  const status = p.organizing
    ? p.status === 'finalized' && p.finalStart
      ? t('polls.status.setFor', { when: when(p.finalStart) })
      : t(`polls.status.${p.status}`)
    : p.status === 'open' && p.meResponded
      ? t('polls.youAnswered')
      : t(`polls.status.${p.status}`);
  const action =
    p.status === 'open' && !p.organizing ? (p.meResponded ? t('polls.change') : t('polls.answer')) : t('polls.view');
  return (
    <Link to="/polls/$pollId" params={{ pollId: p.id }} className={classes.card}>
      <Card withBorder padding="md">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={4} miw={0}>
            <Text fw={600} truncate>
              {p.title}
            </Text>
            <Text size="sm" c="dimmed">
              {[
                p.organizing ? t('polls.youAsk') : t('polls.asks', { name: p.organizer.name }),
                t('polls.times', { count: p.slots }),
                t('polls.answered', { n: p.responded, count: p.participants }),
              ].join(' · ')}
            </Text>
          </Stack>
          <Stack gap={4} align="flex-end">
            <Badge variant="light">{status}</Badge>
            {p.deadline && p.status === 'open' && (
              <Text size="xs" c="dimmed">
                {t('polls.answerBy', { when: when(p.deadline) })}
              </Text>
            )}
            <Text size="sm" c="primary" fw={500}>
              {action}
            </Text>
          </Stack>
        </Group>
      </Card>
    </Link>
  );
}
