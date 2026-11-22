// Tasks, projects and tags. Every list is derived from one query of open tasks (see
// @/services/tasks), so completing or moving a task updates every list at once.
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { homaClient, type TaskInput, type TaskPatch, unwrap } from '@/api';
import {
  type Project,
  ProjectListSchema,
  ProjectSchema,
  type Tag,
  TagListSchema,
  TagSchema,
  type Task,
  TaskListSchema,
  TaskSchema,
} from '@/schemas';

export const taskKeys = {
  all: ['tasks'] as const,
  open: ['tasks', 'open'] as const,
  completed: ['tasks', 'completed'] as const,
  projects: ['projects'] as const,
  tags: ['tags'] as const,
};

export const useTasks = (): UseQueryResult<Task[]> =>
  useQuery({
    queryKey: taskKeys.open,
    queryFn: async (): Promise<Task[]> => TaskListSchema.parse(await unwrap(homaClient.GET('/tasks'))),
  });

/** The most recently completed tasks; only fetched while `enabled`. */
export const useCompletedTasks = (enabled: boolean): UseQueryResult<Task[]> =>
  useQuery({
    queryKey: taskKeys.completed,
    enabled,
    queryFn: async (): Promise<Task[]> =>
      TaskListSchema.parse(await unwrap(homaClient.GET('/tasks', { params: { query: { completed: 'true' } } }))),
  });

export const useProjects = (): UseQueryResult<Project[]> =>
  useQuery({
    queryKey: taskKeys.projects,
    queryFn: async (): Promise<Project[]> => ProjectListSchema.parse(await unwrap(homaClient.GET('/projects'))),
  });

export const useTags = (): UseQueryResult<Tag[]> =>
  useQuery({
    queryKey: taskKeys.tags,
    queryFn: async (): Promise<Tag[]> => TagListSchema.parse(await unwrap(homaClient.GET('/tags'))),
  });

export type TaskMutations = {
  create: UseMutationResult<Task, Error, TaskInput>;
  update: UseMutationResult<Task, Error, TaskPatch & { id: string }>;
  complete: UseMutationResult<Task, Error, string>;
  reopen: UseMutationResult<Task, Error, string>;
  remove: UseMutationResult<void, Error, string>;
};

const path = (id: string): { params: { path: { id: string } } } => ({ params: { path: { id } } });

export function useTaskMutations(): TaskMutations {
  const qc = useQueryClient();
  // A task can name new tags, so the tag list refreshes too.
  const refresh = async (): Promise<void> => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: taskKeys.all }),
      qc.invalidateQueries({ queryKey: taskKeys.tags }),
    ]);
  };
  return {
    create: useMutation({
      mutationFn: async (body: TaskInput): Promise<Task> =>
        TaskSchema.parse(await unwrap(homaClient.POST('/tasks', { body }))),
      onSettled: refresh,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: TaskPatch & { id: string }): Promise<Task> =>
        TaskSchema.parse(await unwrap(homaClient.PATCH('/tasks/{id}', { ...path(id), body }))),
      onSettled: refresh,
    }),
    complete: useMutation({
      mutationFn: async (id: string): Promise<Task> =>
        TaskSchema.parse(await unwrap(homaClient.POST('/tasks/{id}/complete', path(id)))),
      onSettled: refresh,
    }),
    reopen: useMutation({
      mutationFn: async (id: string): Promise<Task> =>
        TaskSchema.parse(await unwrap(homaClient.POST('/tasks/{id}/reopen', path(id)))),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string): Promise<void> => {
        await unwrap(homaClient.DELETE('/tasks/{id}', path(id)));
      },
      onSettled: refresh,
    }),
  };
}

export type ProjectFields = { name: string; color: string | null };

export type ProjectMutations = {
  create: UseMutationResult<Project, Error, ProjectFields>;
  update: UseMutationResult<Project, Error, Partial<ProjectFields> & { id: string }>;
  remove: UseMutationResult<void, Error, string>;
};

export function useProjectMutations(): ProjectMutations {
  const qc = useQueryClient();
  const refresh = (): Promise<void> => qc.invalidateQueries({ queryKey: taskKeys.projects });
  return {
    create: useMutation({
      mutationFn: async (body: ProjectFields): Promise<Project> =>
        ProjectSchema.parse(await unwrap(homaClient.POST('/projects', { body }))),
      onSettled: refresh,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...body }: Partial<ProjectFields> & { id: string }): Promise<Project> =>
        ProjectSchema.parse(await unwrap(homaClient.PATCH('/projects/{id}', { ...path(id), body }))),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string): Promise<void> => {
        await unwrap(homaClient.DELETE('/projects/{id}', path(id)));
      },
      // Its tasks moved to the Inbox.
      onSettled: async (): Promise<void> => {
        await Promise.all([refresh(), qc.invalidateQueries({ queryKey: taskKeys.all })]);
      },
    }),
  };
}

export type TagMutations = {
  rename: UseMutationResult<Tag, Error, { id: string; name: string }>;
  remove: UseMutationResult<void, Error, string>;
};

export function useTagMutations(): TagMutations {
  const qc = useQueryClient();
  const refresh = async (): Promise<void> => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: taskKeys.tags }),
      qc.invalidateQueries({ queryKey: taskKeys.all }),
    ]);
  };
  return {
    rename: useMutation({
      mutationFn: async ({ id, name }: { id: string; name: string }): Promise<Tag> =>
        TagSchema.parse(await unwrap(homaClient.PATCH('/tags/{id}', { ...path(id), body: { name } }))),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string): Promise<void> => {
        await unwrap(homaClient.DELETE('/tags/{id}', path(id)));
      },
      onSettled: refresh,
    }),
  };
}
