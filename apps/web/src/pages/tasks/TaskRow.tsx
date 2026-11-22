import { Badge, Checkbox, Group, Text, UnstyledButton } from '@mantine/core';
import { IconRepeat } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { Task } from '@/schemas';
import { dueState, type TaskItem } from '@/services/tasks';
import { useTasksPageModel } from './model';
import classes from './TasksPage.module.css';

const PRIORITY = ['', classes.p1, classes.p2, classes.p3] as const;

function Row({ task, parent }: { task: Task; parent?: Task }): JSX.Element {
  const { t } = useTranslation();
  const m = useTasksPageModel();
  const done = task.completedAt !== null;
  const state = dueState(task, m.today, new Date());
  // The project is named outside its own list; a subtask shown on its own names its parent.
  const project = m.view.kind === 'project' || task.parentId ? undefined : m.projectName(task.projectId);
  return (
    <div className={classes.row}>
      <Checkbox
        radius="xl"
        className={`${classes.check} ${PRIORITY[task.priority] ?? ''}`}
        checked={done}
        onChange={(): void => m.toggle(task)}
        aria-label={t(done ? 'tasks.reopenLabel' : 'tasks.completeLabel', { title: task.title })}
      />
      <UnstyledButton className={classes.open} onClick={(): void => m.openTask(task.id)}>
        <Text size="sm" className={done ? classes.done : undefined}>
          {task.title}
        </Text>
        <Group gap={6} wrap="wrap">
          {task.dueDate && (
            <Text
              size="xs"
              c={state === 'overdue' ? undefined : 'dimmed'}
              className={state === 'overdue' ? classes.overdue : undefined}
            >
              {m.labels.due(task)}
            </Text>
          )}
          {task.rrule && <IconRepeat size={12} aria-label={t('tasks.repeats')} />}
          {task.priority > 0 && (
            <Text size="xs" c="dimmed">
              {t('tasks.priorityOf', { level: t(`tasks.priorities.${task.priority}`) })}
            </Text>
          )}
          {parent && (
            <Text size="xs" c="dimmed">
              {t('tasks.inParent', { title: parent.title })}
            </Text>
          )}
          {project && (
            <Text size="xs" c="dimmed">
              {project}
            </Text>
          )}
          {task.tags.map((g) => (
            <Badge key={g} size="xs" variant="light" tt="none">
              <bdi>#{g}</bdi>
            </Badge>
          ))}
        </Group>
      </UnstyledButton>
    </div>
  );
}

/** A task with its checkbox, due, priority, project and tags, and the subtasks under it. */
export function TaskRow({ item }: { item: TaskItem }): JSX.Element {
  return (
    <li>
      <Row task={item.task} parent={item.parent} />
      {item.subtasks.length > 0 && (
        <ul className={classes.subtasks}>
          {item.subtasks.map((s) => (
            <li key={s.id}>
              <Row task={s} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
