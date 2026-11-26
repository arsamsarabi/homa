import { Alert, Button, Drawer, Group, NativeSelect, Stack, TextInput } from '@mantine/core';
import { type FormEvent, type JSX, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmCloseModal } from '@/components';
import { useConfirmClose } from '@/hooks/confirm-close';
import { useReminderMutations } from '@/hooks/reminders';
import type { Reminder } from '@/schemas';
import { isoLocal, parseIsoLocal } from '@/services/dates';
import { type Repeat, repeatOf, rruleOf } from '@/services/event-form';
import { instantOf, wallOf } from '@/services/zones';
import { useAnnouncer } from '@/stores';

/** What the drawer is open for: a new reminder (starting at `at`) or one to change. */
export type ReminderDraft = { kind: 'create'; at: Date } | { kind: 'edit'; reminder: Reminder };

export type ReminderDrawerProps = { draft: ReminderDraft | undefined; tz: string; onClose: () => void };

const REPEATS: readonly Repeat[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

/** Create or change a standalone reminder: a title, a time in the home zone, and how it repeats. */
export function ReminderDrawer({ draft, tz, onClose }: ReminderDrawerProps): JSX.Element {
  const { t } = useTranslation();
  const { create, update } = useReminderMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [error, setError] = useState<string>();
  const busy = create.isPending || update.isPending;
  const editing = draft?.kind === 'edit' ? draft.reminder : undefined;
  // An existing reminder keeps its own zone; a new one is in the home zone.
  const zone = editing?.tz ?? tz;
  const at = draft ? (draft.kind === 'edit' ? new Date(draft.reminder.at) : draft.at) : new Date();
  const guard = useConfirmClose(() => {
    setError(undefined);
    onClose();
  });
  const draftKey = draft?.kind === 'edit' ? draft.reminder.id : draft?.kind === 'create' ? 'new' : 'closed';
  useEffect(() => {
    guard.resetDirty();
  }, [draftKey]);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const wall = parseIsoLocal(String(f.get('at') ?? ''));
    if (!wall) {
      setError(t('reminders.badTime'));
      return;
    }
    const repeat = String(f.get('repeat') ?? 'none') as Repeat;
    const fields = {
      title: String(f.get('title') ?? '').trim(),
      at: instantOf(wall, zone).toISOString(),
      tz: zone,
      rrule: rruleOf(repeat, editing?.rrule ?? null),
    };
    const done = (): void => {
      announce(t('reminders.saved'));
      guard.forceClose();
    };
    const fail = (err: Error): void => setError(err.message);
    if (editing) update.mutate({ id: editing.id, ...fields }, { onSuccess: done, onError: fail });
    else create.mutate(fields, { onSuccess: done, onError: fail });
  };

  const repeat = repeatOf(editing?.rrule);
  return (
    <>
      <Drawer
        opened={draft !== undefined}
        onClose={guard.requestClose}
        position="right"
        size="md"
        padding="lg"
        title={editing ? t('reminders.editTitle') : t('reminders.newTitle')}
      >
        {draft && (
          <form onSubmit={submit} onInput={guard.markDirty} onChange={guard.markDirty}>
            <Stack>
              {error && (
                <Alert color="red" role="alert">
                  {t('reminders.saveFailed', { message: error })}
                </Alert>
              )}
              <TextInput
                name="title"
                label={t('reminders.title')}
                defaultValue={editing?.title ?? ''}
                maxLength={200}
                required
                data-autofocus
              />
              <TextInput
                name="at"
                type="datetime-local"
                label={t('reminders.when')}
                description={t('reminders.zone', { tz: zone })}
                defaultValue={isoLocal(wallOf(at, zone))}
                required
              />
              <NativeSelect
                name="repeat"
                label={t('editor.repeat')}
                defaultValue={repeat}
                data={[...REPEATS, ...(repeat === 'custom' ? (['custom'] as const) : [])].map((r) => ({
                  value: r,
                  label: t(`repeat.${r}`),
                }))}
              />
              <Group justify="flex-end">
                <Button variant="default" onClick={guard.requestClose}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" loading={busy}>
                  {t('reminders.save')}
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Drawer>
      <ConfirmCloseModal opened={guard.asking} onDiscard={guard.discard} onKeep={guard.keepEditing} />
    </>
  );
}
