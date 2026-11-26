import { ActionIcon, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type ChangeEvent, type FormEvent, type JSX, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCalendarLocale } from '@/hooks/locale';
import { useTaskMutations } from '@/hooks/tasks';
import { parseTaskLine, quickTaskBody } from '@/services/tasks';
import { useAnnouncer } from '@/stores';
import { useTasksPageModel } from './model';

/** One line to add a task to the list on screen; a date or time in it sets the due ("Buy milk tomorrow"). */
export function TaskQuickAdd(): JSX.Element {
  const { t } = useTranslation();
  const m = useTasksPageModel();
  const { weekStart } = useCalendarLocale();
  const { create } = useTaskMutations();
  const announce = useAnnouncer((s) => s.announce);
  const [text, setText] = useState('');
  const hintId = useId();
  const ctx = { now: new Date(), tz: m.tz, weekStart };
  const due = text.trim() ? parseTaskLine(text, ctx).due : undefined;

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!text.trim()) return;
    const body = quickTaskBody(text, m.view, ctx, m.today);
    create.mutate(body, {
      onSuccess: () => {
        announce(t('tasks.added', { title: body.title }));
        setText('');
      },
      onError: (err: Error) => announce(t('tasks.addFailed', { message: err.message }), { kind: 'error' }),
    });
  };

  return (
    <form onSubmit={submit}>
      <TextInput
        label={t('tasks.addLabel')}
        placeholder={t('tasks.addPlaceholder')}
        value={text}
        onChange={(e: ChangeEvent<HTMLInputElement>): void => setText(e.currentTarget.value)}
        maxLength={500}
        aria-describedby={hintId}
        rightSection={
          <ActionIcon type="submit" variant="subtle" loading={create.isPending} aria-label={t('tasks.add')}>
            <IconPlus size={16} aria-hidden />
          </ActionIcon>
        }
      />
      <Text id={hintId} size="xs" c="dimmed" mt={4} aria-live="polite">
        {due?.dueDate
          ? t('tasks.preview', { when: m.labels.due({ dueDate: due.dueDate, dueTime: due.dueTime ?? null, tz: m.tz }) })
          : t('tasks.addHint')}
      </Text>
    </form>
  );
}
