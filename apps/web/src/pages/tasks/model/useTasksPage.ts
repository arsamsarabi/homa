// The tasks page model: the list the URL names, its sections, the nav counts, the open drawers and
// the actions on a task. Children read it through TasksPageProvider.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHomeZone } from '@/hooks/settings';
import { useCompletedTasks, useProjects, useTags, useTaskMutations, useTasks } from '@/hooks/tasks';
import type { Project, Tag, Task } from '@/schemas';
import { isoDate, today as todayIn } from '@/services/dates';
import { sectionsFor, type TaskCounts, type TaskSection, type TaskView, taskCounts, viewOf } from '@/services/tasks';
import { useAnnouncer } from '@/stores';
import { type DueLabels, useDueLabel } from './useDueLabel';

/** The project drawer: a new project or one to change. */
export type ProjectDraft = { kind: 'create' } | { kind: 'edit'; project: Project };

export type TasksPageModel = {
  view: TaskView;
  /** The list's heading. */
  title: string;
  /** The project or tag the URL names, when it exists. */
  project?: Project;
  tag?: Tag;
  /** The URL names a project or tag that doesn't exist (any more). */
  missing: boolean;
  sections: TaskSection[];
  counts: TaskCounts;
  projects: Project[];
  tags: Tag[];
  projectName: (id: string | null) => string | undefined;
  /** Every task the page knows (open and recently completed), for the drawer. */
  findTask: (id: string) => Task | undefined;
  subtasksOf: (id: string) => Task[];
  loading: boolean;
  error: Error | null;
  retry: () => void;
  today: string;
  tz: string;
  labels: DueLabels;
  toggle: (t: Task) => void;
  editing?: Task;
  openTask: (id: string | undefined) => void;
  projectDraft?: ProjectDraft;
  setProjectDraft: (d: ProjectDraft | undefined) => void;
  tagEditing?: Tag;
  setTagEditing: (t: Tag | undefined) => void;
  /** After deleting the project or tag on screen, go to the Inbox. */
  leaveList: () => void;
};

const EMPTY: Task[] = [];

export function useTasksPage(): TasksPageModel {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/_app/tasks' });
  const view = useMemo(() => viewOf(search), [search]);
  const tz = useHomeZone();
  const today = isoDate(todayIn(tz));
  const labels = useDueLabel(today);
  const announce = useAnnouncer((s) => s.announce);
  const open = useTasks();
  const completed = useCompletedTasks(view.kind === 'completed');
  const projects = useProjects();
  const tags = useTags();
  const { complete, reopen } = useTaskMutations();
  const [editingId, openTask] = useState<string>();
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>();
  const [tagEditing, setTagEditing] = useState<Tag>();

  const openList = open.data ?? EMPTY;
  const doneList = completed.data ?? EMPTY;
  const sections = useMemo(() => sectionsFor(view, openList, doneList, today), [view, openList, doneList, today]);
  const counts = useMemo(() => taskCounts(openList, today), [openList, today]);
  const byId = useMemo(() => new Map([...doneList, ...openList].map((x) => [x.id, x])), [openList, doneList]);

  const project = view.kind === 'project' ? projects.data?.find((p) => p.id === view.id) : undefined;
  const tag =
    view.kind === 'tag' ? tags.data?.find((g) => g.name.toLowerCase() === view.name.toLowerCase()) : undefined;
  const missing =
    (view.kind === 'project' && projects.isSuccess && !project) || (view.kind === 'tag' && tags.isSuccess && !tag);
  const title =
    view.kind === 'project' ? (project?.name ?? '') : view.kind === 'tag' ? `#${view.name}` : t(`tasks.${view.kind}`);

  const fail = (err: Error): void => announce(t('tasks.actionFailed', { message: err.message }), { kind: 'error' });
  const toggle = (task: Task): void => {
    if (task.completedAt) {
      reopen.mutate(task.id, { onSuccess: () => announce(t('tasks.reopened', { title: task.title })), onError: fail });
      return;
    }
    complete.mutate(task.id, {
      onSuccess: (after: Task) =>
        announce(
          after.completedAt
            ? t('tasks.done', { title: task.title })
            : t('tasks.dueAgain', { title: task.title, when: labels.due(after) }),
        ),
      onError: fail,
    });
  };

  const active = view.kind === 'completed' ? completed : open;
  return {
    view,
    title,
    project,
    tag,
    missing,
    sections,
    counts,
    projects: projects.data ?? [],
    tags: tags.data ?? [],
    projectName: (id: string | null): string | undefined =>
      id ? projects.data?.find((p) => p.id === id)?.name : undefined,
    findTask: (id: string): Task | undefined => byId.get(id),
    subtasksOf: (id: string): Task[] => [...byId.values()].filter((x) => x.parentId === id),
    loading: active.isPending,
    error: active.error,
    retry: (): void => void active.refetch(),
    today,
    tz,
    labels,
    toggle,
    editing: editingId ? byId.get(editingId) : undefined,
    openTask,
    projectDraft,
    setProjectDraft,
    tagEditing,
    setTagEditing,
    leaveList: (): void => void navigate({ to: '/tasks', search: { list: 'inbox' } }),
  };
}
