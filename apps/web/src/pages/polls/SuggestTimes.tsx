import { Button, Group, Loader, Popover, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePeople } from '@/hooks/people';
import { usePollMutations } from '@/hooks/polls';
import type { Suggestion } from '@/schemas';
import { addDays, startOfDay, startOfWeek } from '@/services/dates';
import { slotLabel } from '@/services/polls';
import { instantOf, wallOf } from '@/services/zones';

type Range = 'thisWeek' | 'nextWeek' | 'twoWeeks';
type Days = 'any' | 'weekdays' | 'weekends';
type Between = 'any' | 'daytime' | 'evenings';
const BETWEEN: Record<Exclude<Between, 'any'>, { from: string; to: string }> = {
  daytime: { from: '09:00', to: '17:00' },
  evenings: { from: '17:00', to: '22:00' },
};

export type SuggestTimesProps = {
  durationMinutes: number;
  tz: string;
  people: { userId: string; required: boolean }[];
  onAdd: (starts: string[]) => void;
};

/** Finds times when the required people are free, as far as you can see their calendars. */
export function SuggestTimes({ durationMinutes, tz, people, onAdd }: SuggestTimesProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const { suggest } = usePollMutations();
  const directory = usePeople();
  const [range, setRange] = useState<Range>('nextWeek');
  const [days, setDays] = useState<Days>('any');
  const [between, setBetween] = useState<Between>('any');
  const nameOf = (id: string): string => directory.data?.find((p) => p.id === id)?.name ?? id;

  const find = (): void => {
    const now = new Date();
    const week = startOfWeek(startOfDay(wallOf(now, tz)), 1);
    const [fromWall, toWall] =
      range === 'thisWeek'
        ? [wallOf(now, tz), addDays(week, 7)]
        : range === 'nextWeek'
          ? [addDays(week, 7), addDays(week, 14)]
          : [wallOf(now, tz), addDays(wallOf(now, tz), 14)];
    const from = new Date(Math.max(instantOf(fromWall, tz).getTime(), now.getTime()));
    suggest.mutate({
      from: from.toISOString(),
      to: instantOf(toWall, tz).toISOString(),
      durationMinutes,
      tz,
      people,
      days,
      between: between === 'any' ? null : BETWEEN[between],
    });
  };
  const status = (s: Suggestion): string =>
    s.busy.length ? t('polls.suggestBusy', { names: s.busy.map(nameOf).join(', ') }) : t('polls.suggestFree');

  return (
    <Popover width={360} position="bottom-end" withinPortal={false} trapFocus>
      <Popover.Target>
        <Button variant="light" size="xs" leftSection={<IconSparkles size={14} aria-hidden />}>
          {t('polls.suggest')}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <SegmentedControl
            size="xs"
            aria-label={t('polls.suggestRange')}
            value={range}
            onChange={(v: string): void => setRange(v as Range)}
            data={(['thisWeek', 'nextWeek', 'twoWeeks'] as const).map((v) => ({
              value: v,
              label: t(`polls.range.${v}`),
            }))}
          />
          <SegmentedControl
            size="xs"
            aria-label={t('polls.suggestDays')}
            value={days}
            onChange={(v: string): void => setDays(v as Days)}
            data={(['any', 'weekdays', 'weekends'] as const).map((v) => ({ value: v, label: t(`polls.days.${v}`) }))}
          />
          <SegmentedControl
            size="xs"
            aria-label={t('polls.suggestBetween')}
            value={between}
            onChange={(v: string): void => setBetween(v as Between)}
            data={(['any', 'daytime', 'evenings'] as const).map((v) => ({ value: v, label: t(`polls.between.${v}`) }))}
          />
          <Button size="xs" onClick={find} loading={suggest.isPending}>
            {t('polls.findTimes')}
          </Button>
          {suggest.isPending && <Loader size="xs" aria-label={t('common.loading')} />}
          {suggest.error && (
            <Text size="sm" c="red" role="alert">
              {suggest.error.message}
            </Text>
          )}
          {suggest.data?.length === 0 && <Text size="sm">{t('polls.noSuggestions')}</Text>}
          {suggest.data?.map((s) => (
            <Group key={s.start} justify="space-between" wrap="nowrap">
              <Stack gap={0}>
                <Text size="sm">{slotLabel(s.start, s.end, i18n.language, tz)}</Text>
                <Text size="xs" c="dimmed">
                  {status(s)}
                </Text>
              </Stack>
              <Button size="xs" variant="default" onClick={(): void => onAdd([s.start])}>
                {t('polls.add')}
              </Button>
            </Group>
          ))}
          {Boolean(suggest.data?.length) && (
            <Button size="xs" variant="light" onClick={(): void => onAdd(suggest.data?.map((s) => s.start) ?? [])}>
              {t('polls.addAll')}
            </Button>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
