import { Button, Table, Text, Title } from '@mantine/core';
import { IconStarFilled } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useHomeZone } from '@/hooks/settings';
import type { Poll } from '@/schemas';
import { slotLabel } from '@/services/polls';

export type PollResultsProps = {
  poll: Poll;
  /** The organizer picks a time from here; others just see the table. */
  onPick?: (slotId: string) => void;
};

/** The times in the order the answers put them, with who can make each, and answers by person. */
export function PollResults({ poll, onPick }: PollResultsProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const tz = useHomeZone();
  const name = (participantId: string): string => poll.participants.find((x) => x.id === participantId)?.name ?? '';
  const required = (participantId: string): boolean =>
    poll.participants.find((x) => x.id === participantId)?.required ?? false;
  const slot = (id: string): string => {
    const s = poll.slots.find((x) => x.id === id);
    return s ? slotLabel(s.start, s.end, i18n.language, tz) : id;
  };
  const best = poll.results.find((r) => r.eligible);
  const names = (ids: string[]): string =>
    ids.length
      ? ids.map((id) => (required(id) ? t('polls.requiredName', { name: name(id) }) : name(id))).join(', ')
      : '–';

  return (
    <>
      <Title order={2} size="h4">
        {t('polls.results')}
      </Title>
      {best ? (
        <Text>{t('polls.recommendedLine', { time: slot(best.slotId) })}</Text>
      ) : (
        <Text c="dimmed">{t('polls.noneEligible')}</Text>
      )}
      <Table.ScrollContainer minWidth={640}>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('polls.col.time')}</Table.Th>
              <Table.Th>{t('polls.col.points')}</Table.Th>
              <Table.Th>{t('polls.col.canMake')}</Table.Th>
              <Table.Th>{t('polls.col.cannot')}</Table.Th>
              <Table.Th>{t('polls.col.notYet')}</Table.Th>
              {onPick && <Table.Th>{t('polls.col.pick')}</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {poll.results.map((r) => (
              <Table.Tr key={r.slotId} c={r.eligible ? undefined : 'dimmed'}>
                <Table.Td>
                  {r.slotId === best?.slotId && (
                    <>
                      <IconStarFilled size={14} aria-hidden />{' '}
                      <Text span size="xs" fw={600}>
                        {t('polls.recommended')}
                      </Text>{' '}
                    </>
                  )}
                  {slot(r.slotId)}
                  {!r.eligible && (
                    <Text size="xs">
                      {r.requiredCannot.length
                        ? t('polls.whyRequired', { names: r.requiredCannot.map(name).join(', ') })
                        : t('polls.whyQuorum', { n: r.canMake.length, needed: r.needed })}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>{r.points}</Table.Td>
                <Table.Td>{t('polls.ofPeople', { n: r.canMake.length, count: poll.participants.length })}</Table.Td>
                <Table.Td>{names(r.cannot)}</Table.Td>
                <Table.Td>{names(r.unranked)}</Table.Td>
                {onPick && (
                  <Table.Td>
                    <Button
                      size="xs"
                      variant={r.slotId === best?.slotId ? 'filled' : 'default'}
                      onClick={(): void => onPick(r.slotId)}
                      aria-label={t('polls.pickLabel', { time: slot(r.slotId) })}
                    >
                      {t('polls.pick')}
                    </Button>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Title order={3} size="h5">
        {t('polls.byPerson')}
      </Title>
      <Table.ScrollContainer minWidth={480}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('polls.col.person')}</Table.Th>
              {poll.slots.map((s) => (
                <Table.Th key={s.id}>{slot(s.id)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {poll.participants.map((x) => {
              const a = poll.answers.find((y) => y.participantId === x.id);
              const busy = new Set(poll.busy?.find((b) => b.participantId === x.id)?.slotIds ?? []);
              return (
                <Table.Tr key={x.id}>
                  <Table.Th scope="row">{required(x.id) ? t('polls.requiredName', { name: x.name }) : x.name}</Table.Th>
                  {poll.slots.map((s) => {
                    const n = a?.ranked.indexOf(s.id) ?? -1;
                    return (
                      <Table.Td key={s.id}>
                        {n >= 0
                          ? n + 1
                          : a?.cannot.includes(s.id)
                            ? t('polls.cant')
                            : busy.has(s.id)
                              ? t('polls.busyShort')
                              : '–'}
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </>
  );
}
