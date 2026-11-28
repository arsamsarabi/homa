import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Group,
  NativeSelect,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { type ChangeEvent, type FormEvent, type JSX, type KeyboardEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmCloseModal, ReminderChips, RepeatPicker } from '@/components';
import { useConfirmClose } from '@/hooks/confirm-close';
import { useTaskMutations } from '@/hooks/tasks';
import type { Task } from '@/schemas';
import { isSubDaily, REPEAT_UNITS, weekdayOf } from '@/services/repeat';

/** Dues are days (with an optional time), so tasks repeat by the day or longer. */
const TASK_UNITS = REPEAT_UNITS.filter((u) => !isSubDaily(u));

import { useAnnouncer } from '@/stores';
import { useTasksPageModel } from './model';
import { TaskBlock } from './TaskBlock';

const PRIORITIES = ['0', '1', '2', '3'] as const;

function TaskForm({
  task,
  onClose,
  onSaved,
  onDirty,
}: {
  task: Task;
  onClose: () => void;
  onSaved: () => void;
  onDirty: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const m = useTasksPageModel();
  const { update, remove, create, complete, reopen } = useTaskMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [error, setError] = useState<string>();
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [tags, setTags] = useState<string[]>(task.tags);
  const [reminders, setReminders] = useState<number[]>(task.reminders);
  const [subtask, setSubtask] = useState('');
  const subtasks = task.parentId ? [] : m.subtasksOf(task.id);
  const [rrule, setRrule] = useState<string | null>(task.rrule);
  // Inline Alert owns failure feedback; do not also toast.
  const fail = (err: Error): void => setError(err.message);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const time = String(f.get('dueTime') ?? '');
    update.mutate(
      {
        id: task.id,
        title: String(f.get('title') ?? '').trim(),
        notes: String(f.get('notes') ?? '').trim() || null,
        ...(task.parentId ? {} : { projectId: String(f.get('projectId') ?? '') || null }),
        priority: Number(f.get('priority') ?? 0),
        tags,
        dueDate: dueDate || null,
        dueTime: dueDate && time ? time : null,
        rrule: dueDate ? rrule : null,
        reminders: dueDate ? reminders : [],
      },
      {
        onSuccess: () => {
          announce(t('tasks.saved'));
          onSaved();
        },
        onError: fail,
      },
    );
  };

  const onDelete = (): void => {
    const title = task.title;
    onSaved();
    remove.mutate(task.id, {
      onSuccess: () => announce(t('tasks.deleted', { title })),
      onError: (err: Error): void => announce(t('tasks.deleteFailed', { message: err.message }), { kind: 'error' }),
    });
  };

  const addSubtask = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const title = subtask.trim();
    if (!title) return;
    create.mutate({ title, tz: task.tz, parentId: task.id }, { onSuccess: () => setSubtask(''), onError: fail });
  };

  return (
    <Stack>
      <form onSubmit={submit} onInput={onDirty} onChange={onDirty}>
        <Stack>
          {error && (
            <Alert color="red" role="alert">
              {t('tasks.saveFailed', { message: error })}
            </Alert>
          )}
          <TextInput
            name="title"
            label={t('tasks.title')}
            defaultValue={task.title}
            maxLength={500}
            required
            data-autofocus
          />
          <Textarea
            name="notes"
            label={t('tasks.notes')}
            defaultValue={task.notes ?? ''}
            autosize
            minRows={2}
            maxLength={10_000}
          />
          {!task.parentId && (
            <NativeSelect
              name="projectId"
              label={t('tasks.project')}
              defaultValue={task.projectId ?? ''}
              data={[
                { value: '', label: t('tasks.inbox') },
                ...m.projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          )}
          <Group grow align="flex-start">
            <TextInput
              name="dueDate"
              type="date"
              label={t('tasks.due')}
              value={dueDate}
              onChange={(e: ChangeEvent<HTMLInputElement>): void => {
                onDirty();
                setDueDate(e.currentTarget.value);
              }}
              description={dueDate ? m.labels.due({ dueDate, dueTime: null, tz: task.tz }) : t('tasks.clearDue')}
            />
            <TextInput
              name="dueTime"
              type="time"
              label={t('tasks.dueTime')}
              defaultValue={task.dueTime ?? ''}
              disabled={!dueDate}
              description={t('tasks.dueTimeHint', { tz: task.tz })}
            />
          </Group>
          <RepeatPicker
            value={rrule}
            onChange={(v: string | null): void => {
              onDirty();
              setRrule(v);
            }}
            startDay={dueDate ? weekdayOf(new Date(`${dueDate}T00:00:00Z`)) : undefined}
            units={TASK_UNITS}
            disabled={!dueDate}
            description={dueDate ? undefined : t('tasks.repeatNeedsDate')}
          />
          <ReminderChips
            value={reminders}
            onChange={(v: number[]): void => {
              onDirty();
              setReminders(v);
            }}
            atStartLabel={t('tasks.atDue')}
            disabled={!dueDate}
            description={dueDate ? t('tasks.reminderHint') : t('tasks.reminderNeedsDate')}
          />
          <NativeSelect
            name="priority"
            label={t('tasks.priority')}
            defaultValue={String(task.priority)}
            data={PRIORITIES.map((p) => ({ value: p, label: t(`tasks.priorities.${p}`) }))}
          />
          <TagsInput
            label={t('tasks.tagsField')}
            description={t('tasks.tagsHint')}
            value={tags}
            onChange={(v: string[]): void => {
              onDirty();
              setTags(v);
            }}
            data={m.tags.map((g) => g.name)}
            maxTags={20}
            splitChars={[',']}
            clearable
          />
          {!task.parentId && (
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                {t('tasks.subtasks')}
              </Text>
              {subtasks.map((s) => (
                <Checkbox
                  key={s.id}
                  size="sm"
                  radius="xl"
                  label={s.title}
                  checked={s.completedAt !== null}
                  onChange={(): void => (s.completedAt ? reopen : complete).mutate(s.id, { onError: fail })}
                />
              ))}
              <TextInput
                size="sm"
                aria-label={t('tasks.addSubtask')}
                placeholder={t('tasks.addSubtask')}
                value={subtask}
                onChange={(e: ChangeEvent<HTMLInputElement>): void => setSubtask(e.currentTarget.value)}
                onKeyDown={addSubtask}
                maxLength={500}
              />
            </Stack>
          )}
          <Group justify="space-between">
            <Button variant="light" color="red" onClick={onDelete} loading={remove.isPending}>
              {t('tasks.delete')}
            </Button>
            <Group gap="xs">
              <Button variant="default" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={update.isPending}>
                {t('tasks.save')}
              </Button>
            </Group>
          </Group>
          {subtasks.length > 0 && (
            <Text size="xs" c="dimmed">
              {t('tasks.deleteHint')}
            </Text>
          )}
        </Stack>
      </form>
      {/* Outside the form so Block time fields do not mark the task draft dirty. */}
      <TaskBlock task={task} />
    </Stack>
  );
}

/** Edit a task: title, notes, project, due, repeat, priority, tags and subtasks; or delete it. */
export function TaskDrawer(): JSX.Element {
  const { t } = useTranslation();
  const m = useTasksPageModel();
  const realClose = (): void => m.openTask(undefined);
  const guard = useConfirmClose(realClose);
  const editingId = m.editing?.id;
  useEffect(() => {
    guard.resetDirty();
  }, [editingId]);

  return (
    <>
      <Drawer
        opened={m.editing !== undefined}
        onClose={guard.requestClose}
        position="right"
        size="md"
        padding="lg"
        title={t('tasks.editTitle')}
      >
        {m.editing && (
          <TaskForm
            key={m.editing.id}
            task={m.editing}
            onClose={guard.requestClose}
            onSaved={guard.forceClose}
            onDirty={guard.markDirty}
          />
        )}
      </Drawer>
      <ConfirmCloseModal opened={guard.asking} onDiscard={guard.discard} onKeep={guard.keepEditing} />
    </>
  );
}
