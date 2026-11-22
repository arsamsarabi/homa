import { Alert, Button, Container, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryErrorAlert } from '@/components';
import type { SectionHeading, TaskView } from '@/services/tasks';
import { TasksPageProvider, useTasksPageModel } from './model';
import { ProjectDrawer } from './ProjectDrawer';
import { TagDrawer } from './TagDrawer';
import { TaskDrawer } from './TaskDrawer';
import { TaskQuickAdd } from './TaskQuickAdd';
import { TaskRow } from './TaskRow';
import { TasksNav } from './TasksNav';
import classes from './TasksPage.module.css';

const EMPTY: Record<TaskView['kind'], string> = {
  inbox: 'tasks.emptyInbox',
  today: 'tasks.emptyToday',
  upcoming: 'tasks.emptyUpcoming',
  completed: 'tasks.emptyCompleted',
  project: 'tasks.emptyProject',
  tag: 'tasks.emptyTag',
};

function Heading({ heading }: { heading: SectionHeading }): JSX.Element | null {
  const { t } = useTranslation();
  const m = useTasksPageModel();
  if (heading.kind === 'none') return null;
  return (
    <Title order={2} size="h5" mb={4} c={heading.kind === 'overdue' ? 'red' : undefined}>
      {heading.kind === 'overdue' ? t('tasks.overdue') : m.labels.day(heading.date)}
    </Title>
  );
}

function TaskLists(): JSX.Element {
  const { t } = useTranslation();
  const m = useTasksPageModel();
  const { project, tag } = m;
  return (
    <Stack gap="lg" component="section" aria-label={m.title}>
      <Group justify="space-between">
        <Title order={1}>
          <bdi>{m.title}</bdi>
        </Title>
        <Group gap="xs">
          {project && (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconPencil size={14} aria-hidden />}
              onClick={(): void => m.setProjectDraft({ kind: 'edit', project })}
            >
              {t('tasks.editProject')}
            </Button>
          )}
          {tag && (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconPencil size={14} aria-hidden />}
              onClick={(): void => m.setTagEditing(tag)}
            >
              {t('tasks.editTag')}
            </Button>
          )}
          <Button
            size="xs"
            variant="default"
            hiddenFrom="sm"
            leftSection={<IconPlus size={14} aria-hidden />}
            onClick={(): void => m.setProjectDraft({ kind: 'create' })}
          >
            {t('tasks.newProject')}
          </Button>
        </Group>
      </Group>
      {m.missing ? (
        <Alert color="yellow">{t('tasks.notFound')}</Alert>
      ) : (
        <>
          {m.view.kind !== 'completed' && <TaskQuickAdd />}
          {m.loading && <Loader size="sm" aria-label={t('common.loading')} />}
          {m.error && <QueryErrorAlert title={t('tasks.loadFailed')} error={m.error} onRetry={m.retry} />}
          {!m.loading && !m.error && m.sections.length === 0 && <Text c="dimmed">{t(EMPTY[m.view.kind])}</Text>}
          {m.sections.map((s) => (
            <section key={s.id}>
              <Heading heading={s.heading} />
              <ul className={classes.list}>
                {s.items.map((item) => (
                  <TaskRow key={item.task.id} item={item} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </Stack>
  );
}

/** Tasks: Inbox, Today, Upcoming and Completed, and a list per project and per tag. */
export function TasksPage(): JSX.Element {
  return (
    <TasksPageProvider>
      <Container size="lg" py="md">
        <div className={classes.layout}>
          <TasksNav />
          <TaskLists />
        </div>
      </Container>
      <TaskDrawer />
      <ProjectDrawer />
      <TagDrawer />
    </TasksPageProvider>
  );
}
