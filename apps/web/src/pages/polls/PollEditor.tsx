import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Drawer,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { IconClock, IconX } from '@tabler/icons-react';
import { type ChangeEvent, type FormEvent, type JSX, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AmountPicker, ConfirmCloseModal } from '@/components';
import { useCalendars } from '@/hooks/calendar';
import { useConfirmClose } from '@/hooks/confirm-close';
import { useCircles, usePeople } from '@/hooks/people';
import { type PollFields, usePollMutations } from '@/hooks/polls';
import { useHomeZone } from '@/hooks/settings';
import type { Poll } from '@/schemas';
import { isWritableCalendar } from '@/services/calendar-sharing';
import { isoLocal, parseIsoLocal } from '@/services/dates';
import { travelDuration } from '@/services/event-form';
import { slotLabel } from '@/services/polls';
import { instantOf, wallOf } from '@/services/zones';
import { useAnnouncer } from '@/stores';
import { SuggestTimes } from './SuggestTimes';

const LENGTHS = [30, 60, 90, 120, 180] as const;
const MAX_MINUTES = 24 * 60;

export type PollEditorProps = {
  opened: boolean;
  /** The poll to change; a new one when left out. */
  poll?: Poll;
  onClose: () => void;
  onSaved: (id: string) => void;
};

type Person = { userId: string; required: boolean };

/** Create or change a poll: what it is, who's in it, the times to choose from, and the deadline. */
export function PollEditor({ opened, poll, onClose, onSaved }: PollEditorProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const tz = useHomeZone();
  const people = usePeople();
  const circles = useCircles();
  const calendars = useCalendars();
  const { create, update, open } = usePollMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [error, setError] = useState<string>();
  const [duration, setDuration] = useState(60);
  const [chosen, setChosen] = useState<Person[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [adding, setAdding] = useState('');
  const [holds, setHolds] = useState(false);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [quorum, setQuorum] = useState<number | string>('');
  const guard = useConfirmClose(() => {
    setError(undefined);
    onClose();
  });
  const zone = poll?.tz ?? tz;
  const draft = !poll || poll.status === 'draft';
  const busy = create.isPending || update.isPending || open.isPending;

  useEffect(() => {
    if (!opened) return;
    guard.resetDirty();
    setDuration(poll?.durationMinutes ?? 60);
    setChosen(
      poll?.participants
        .filter((x) => x.userId !== poll.organizer.id)
        .map((x) => ({ userId: x.userId, required: x.required })) ?? [],
    );
    setSlots(poll?.slots.map((s) => s.start) ?? []);
    setHolds(poll?.holds ?? false);
    setCalendarId(poll?.calendarId ?? null);
    setQuorum(poll?.quorum ?? '');
    setAdding('');
  }, [opened, poll?.id]);

  const dirty = (): void => guard.markDirty();
  const nameOf = (userId: string): string =>
    people.data?.find((p) => p.id === userId)?.name ??
    poll?.participants.find((x) => x.userId === userId)?.name ??
    userId;
  const addPeople = (ids: readonly string[]): void => {
    dirty();
    setChosen((was) => [
      ...was,
      ...[...new Set(ids)]
        .filter((id) => !was.some((x) => x.userId === id))
        .map((userId) => ({ userId, required: false })),
    ]);
  };
  const addSlot = (iso: string): void => {
    dirty();
    setSlots((was) => (was.includes(iso) ? was : [...was, iso].sort()));
  };
  const writable = (calendars.data ?? []).filter(isWritableCalendar);

  const save =
    (send: boolean) =>
    (e?: FormEvent<HTMLFormElement>): void => {
      e?.preventDefault();
      const form = document.getElementById('poll-editor') as HTMLFormElement | null;
      if (!form?.reportValidity()) return;
      const f = new FormData(form);
      const deadlineWall = parseIsoLocal(String(f.get('deadline') ?? ''));
      const text = (k: string): string | null => String(f.get(k) ?? '').trim() || null;
      const fields: PollFields = {
        title: String(f.get('title') ?? '').trim(),
        description: text('description'),
        location: text('location'),
        durationMinutes: duration,
        tz: zone,
        slots,
        people: chosen,
        deadline: deadlineWall ? instantOf(deadlineWall, zone).toISOString() : null,
        quorum: typeof quorum === 'number' ? quorum : null,
        holds,
        calendarId: calendarId ?? writable[0]?.id ?? null,
      };
      const fail = (err: Error): void => setError(err.message);
      const done = (p: Poll): void => {
        if (send && p.status === 'draft')
          open.mutate(p.id, {
            onSuccess: (): void => {
              announce(t('polls.sent', { title: p.title }));
              guard.forceClose();
              onSaved(p.id);
            },
            onError: fail,
          });
        else {
          announce(t('polls.saved', { title: p.title }));
          guard.forceClose();
          onSaved(p.id);
        }
      };
      if (poll) {
        const { durationMinutes, tz: _tz, ...rest } = fields;
        update.mutate({ id: poll.id, ...rest, ...(draft && { durationMinutes }) }, { onSuccess: done, onError: fail });
      } else create.mutate(fields, { onSuccess: done, onError: fail });
    };

  const options = [
    ...(circles.data ?? [])
      .filter((c) => c.memberIds.length)
      .map((c) => ({ value: `circle:${c.id}`, label: t('polls.circle', { name: c.name, count: c.memberIds.length }) })),
    ...(people.data ?? [])
      .filter((p) => !chosen.some((x) => x.userId === p.id))
      .map((p) => ({ value: p.id, label: `${p.name} (${p.email})` })),
  ];

  return (
    <>
      <Drawer
        opened={opened}
        onClose={guard.requestClose}
        position="right"
        size="lg"
        padding="lg"
        title={poll ? t('polls.editTitle') : t('polls.newTitle')}
      >
        <form id="poll-editor" onSubmit={save(draft)} onInput={dirty} onChange={dirty}>
          <Stack>
            {error && (
              <Alert color="red" role="alert">
                {t('polls.saveFailed', { message: error })}
              </Alert>
            )}
            <TextInput
              name="title"
              label={t('polls.fields.title')}
              defaultValue={poll?.title ?? ''}
              maxLength={200}
              required
              data-autofocus
            />
            <AmountPicker<'minutes' | 'hours'>
              label={t('polls.fields.length')}
              description={draft ? undefined : t('polls.lengthFixed')}
              icon={<IconClock size={14} aria-hidden />}
              valueText={travelDuration(duration, i18n.language)}
              options={LENGTHS.map((m) => ({
                key: String(m),
                label: travelDuration(m, i18n.language),
                selected: m === duration,
                onSelect: (): void => {
                  dirty();
                  setDuration(m);
                },
              }))}
              units={(['minutes', 'hours'] as const).map((u) => ({
                value: u,
                label: (count: number) => t(`units.${u}`, { count }),
              }))}
              initial={
                duration % 60 === 0 ? { amount: duration / 60, unit: 'hours' } : { amount: duration, unit: 'minutes' }
              }
              min={1}
              preview={(n: number, u: 'minutes' | 'hours'): string =>
                travelDuration(u === 'hours' ? n * 60 : n, i18n.language)
              }
              onCustom={(n: number, u: 'minutes' | 'hours'): string | undefined => {
                const m = u === 'hours' ? n * 60 : n;
                if (m < 5 || m > MAX_MINUTES) return t('polls.lengthRange');
                dirty();
                setDuration(m);
                return undefined;
              }}
              submitLabel={t('editor.travelSet')}
              disabled={!draft}
              withinPortal={false}
            />
            <TextInput
              name="location"
              label={t('editor.location')}
              defaultValue={poll?.location ?? ''}
              maxLength={500}
            />
            <Textarea
              name="description"
              label={t('editor.description')}
              defaultValue={poll?.description ?? ''}
              maxLength={5000}
              autosize
              minRows={2}
            />

            <Title order={2} size="h4">
              {t('polls.fields.people')}
            </Title>
            <MultiSelect
              aria-label={t('polls.fields.peopleSearch')}
              placeholder={t('polls.fields.peopleSearch')}
              data={options}
              value={[]}
              onChange={(v: string[]): void => {
                const picked = v.at(-1);
                if (!picked) return;
                const circle = picked.startsWith('circle:')
                  ? circles.data?.find((c) => `circle:${c.id}` === picked)
                  : undefined;
                addPeople(circle ? circle.memberIds : [picked]);
              }}
              searchable
              nothingFoundMessage={t('people.circles.nobodyFound')}
              comboboxProps={{ withinPortal: false }}
            />
            <Stack gap="xs" component="ul" p={0} m={0} style={{ listStyle: 'none' }}>
              <Group component="li" justify="space-between">
                <Text size="sm">{t('polls.you')}</Text>
                <Switch label={t('polls.required')} checked disabled labelPosition="left" />
              </Group>
              {chosen.map((x) => (
                <Group component="li" key={x.userId} justify="space-between" wrap="nowrap">
                  <Text size="sm" truncate>
                    {nameOf(x.userId)}
                  </Text>
                  <Group gap="xs" wrap="nowrap">
                    <Switch
                      label={t('polls.required')}
                      labelPosition="left"
                      checked={x.required}
                      onChange={(e: ChangeEvent<HTMLInputElement>): void => {
                        const required = e.currentTarget.checked;
                        dirty();
                        setChosen((was) => was.map((y) => (y.userId === x.userId ? { ...y, required } : y)));
                      }}
                    />
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={t('polls.removePerson', { name: nameOf(x.userId) })}
                      onClick={(): void => {
                        dirty();
                        setChosen((was) => was.filter((y) => y.userId !== x.userId));
                      }}
                    >
                      <IconX size={16} aria-hidden />
                    </ActionIcon>
                  </Group>
                </Group>
              ))}
            </Stack>
            <NumberInput
              label={t('polls.fields.quorum')}
              description={t('polls.quorumHint', { count: chosen.length + 1 })}
              min={2}
              max={chosen.length + 1}
              value={quorum}
              onChange={(v: number | string): void => {
                dirty();
                setQuorum(v);
              }}
              allowDecimal={false}
            />

            <Group justify="space-between">
              <Title order={2} size="h4">
                {t('polls.fields.times')}
              </Title>
              <SuggestTimes
                durationMinutes={duration}
                tz={zone}
                people={chosen}
                onAdd={(starts: string[]): void => starts.forEach(addSlot)}
              />
            </Group>
            <Stack
              gap={4}
              component="ul"
              p={0}
              m={0}
              style={{ listStyle: 'none' }}
              aria-label={t('polls.fields.times')}
            >
              {slots.length === 0 && (
                <Text size="sm" c="dimmed" component="li">
                  {t('polls.noTimes')}
                </Text>
              )}
              {slots.map((s) => {
                const label = slotLabel(
                  s,
                  new Date(new Date(s).getTime() + duration * 60_000).toISOString(),
                  i18n.language,
                  zone,
                );
                return (
                  <Group component="li" key={s} justify="space-between" wrap="nowrap">
                    <Text size="sm">{label}</Text>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={t('polls.removeTime', { time: label })}
                      onClick={(): void => {
                        dirty();
                        setSlots((was) => was.filter((x) => x !== s));
                      }}
                    >
                      <IconX size={16} aria-hidden />
                    </ActionIcon>
                  </Group>
                );
              })}
            </Stack>
            <Group align="flex-end" wrap="nowrap">
              <TextInput
                type="datetime-local"
                label={t('polls.addTime')}
                description={t('reminders.zone', { tz: zone })}
                value={adding}
                onChange={(e: ChangeEvent<HTMLInputElement>): void => setAdding(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button
                variant="default"
                disabled={!parseIsoLocal(adding)}
                onClick={(): void => {
                  const wall = parseIsoLocal(adding);
                  if (wall) addSlot(instantOf(wall, zone).toISOString());
                  setAdding('');
                }}
              >
                {t('polls.add')}
              </Button>
            </Group>

            <TextInput
              name="deadline"
              type="datetime-local"
              label={t('polls.fields.deadline')}
              description={t('polls.deadlineHint')}
              defaultValue={poll?.deadline ? isoLocal(wallOf(new Date(poll.deadline), zone)) : ''}
            />
            <Checkbox
              label={t('polls.fields.holds')}
              description={t('polls.holdsHint')}
              checked={holds}
              onChange={(e: ChangeEvent<HTMLInputElement>): void => setHolds(e.currentTarget.checked)}
            />
            <Select
              label={t('polls.fields.calendar')}
              data={writable.map((c) => ({ value: c.id, label: c.name }))}
              value={calendarId ?? writable[0]?.id ?? null}
              onChange={(v: string | null): void => {
                dirty();
                setCalendarId(v);
              }}
              allowDeselect={false}
              comboboxProps={{ withinPortal: false }}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={guard.requestClose}>
                {t('common.cancel')}
              </Button>
              {draft && (
                <Button variant="light" loading={busy} onClick={(): void => save(false)()}>
                  {t('polls.saveDraft')}
                </Button>
              )}
              <Button type="submit" loading={busy}>
                {draft ? t('polls.send') : t('polls.saveChanges')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Drawer>
      <ConfirmCloseModal opened={guard.asking} onDiscard={guard.discard} onKeep={guard.keepEditing} />
    </>
  );
}
