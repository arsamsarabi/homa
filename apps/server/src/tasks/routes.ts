// REST routes for tasks, projects and tags. Every route needs a signed-in user; another user's
// task, project or tag is a 404.
import type { Db } from '@homa/db';
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { type Auth, requireUser, type UserVars } from '@/auth';
import { errorResponses as errors, jsonBody, jsonContent, newApi } from '@/http/openapi';
import * as projects from './projects-service';
import { projectOut, tagOut, taskOut } from './responses';
import {
  BlockInput,
  Id,
  Project,
  ProjectInput,
  ProjectPatch,
  Tag,
  TagPatch,
  Task,
  TaskInput,
  TaskListQuery,
  TaskPatch,
} from './schemas';
import * as tasks from './tasks-service';

const tags = { tasks: ['Tasks'] };
const changed: Record<200 | 401 | 404, ReturnType<typeof jsonContent>> = {
  200: jsonContent(Task, 'The task'),
  401: errors[401],
  404: errors[404],
};
const r = {
  listTasks: createRoute({
    method: 'get',
    path: '/tasks',
    operationId: 'listTasks',
    tags: tags.tasks,
    summary: 'Your open tasks (subtasks too), soonest due first; or the most recently completed ones',
    request: { query: TaskListQuery },
    responses: { 200: jsonContent(z.array(Task), 'Tasks'), 400: errors[400], 401: errors[401] },
  }),
  createTask: createRoute({
    method: 'post',
    path: '/tasks',
    operationId: 'createTask',
    tags: tags.tasks,
    summary: 'Create a task (a subtask with parentId)',
    request: jsonBody(TaskInput),
    responses: { 201: jsonContent(Task, 'Created'), 400: errors[400], 401: errors[401] },
  }),
  updateTask: createRoute({
    method: 'patch',
    path: '/tasks/{id}',
    operationId: 'updateTask',
    tags: tags.tasks,
    summary: 'Change a task; tags replace the old ones',
    request: { params: Id, ...jsonBody(TaskPatch) },
    responses: { ...changed, 400: errors[400] },
  }),
  completeTask: createRoute({
    method: 'post',
    path: '/tasks/{id}/complete',
    operationId: 'completeTask',
    tags: tags.tasks,
    summary: 'Complete a task and its subtasks; a repeating task moves to its next due instead',
    request: { params: Id },
    responses: changed,
  }),
  reopenTask: createRoute({
    method: 'post',
    path: '/tasks/{id}/reopen',
    operationId: 'reopenTask',
    tags: tags.tasks,
    summary: 'Open a completed task again (and its parent)',
    request: { params: Id },
    responses: changed,
  }),
  scheduleTask: createRoute({
    method: 'put',
    path: '/tasks/{id}/block',
    operationId: 'scheduleTask',
    tags: tags.tasks,
    summary: 'Block time for the task on the calendar (an event linked to it), or move its block',
    request: { params: Id, ...jsonBody(BlockInput) },
    responses: { ...changed, 400: errors[400], 403: errors[403] },
  }),
  unscheduleTask: createRoute({
    method: 'delete',
    path: '/tasks/{id}/block',
    operationId: 'unscheduleTask',
    tags: tags.tasks,
    summary: "Take the task's time block off the calendar (deletes its event)",
    request: { params: Id },
    responses: { ...changed, 403: errors[403] },
  }),
  deleteTask: createRoute({
    method: 'delete',
    path: '/tasks/{id}',
    operationId: 'deleteTask',
    tags: tags.tasks,
    summary: 'Delete a task and its subtasks',
    request: { params: Id },
    responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
  }),
  listProjects: createRoute({
    method: 'get',
    path: '/projects',
    operationId: 'listProjects',
    tags: tags.tasks,
    summary: 'Your projects, by name',
    responses: { 200: jsonContent(z.array(Project), 'Projects'), 401: errors[401] },
  }),
  createProject: createRoute({
    method: 'post',
    path: '/projects',
    operationId: 'createProject',
    tags: tags.tasks,
    summary: 'Create a project',
    request: jsonBody(ProjectInput),
    responses: { 201: jsonContent(Project, 'Created'), 400: errors[400], 401: errors[401] },
  }),
  updateProject: createRoute({
    method: 'patch',
    path: '/projects/{id}',
    operationId: 'updateProject',
    tags: tags.tasks,
    summary: 'Rename or recolor a project',
    request: { params: Id, ...jsonBody(ProjectPatch) },
    responses: { 200: jsonContent(Project, 'Updated'), 400: errors[400], 401: errors[401], 404: errors[404] },
  }),
  deleteProject: createRoute({
    method: 'delete',
    path: '/projects/{id}',
    operationId: 'deleteProject',
    tags: tags.tasks,
    summary: 'Delete a project; its tasks move to the Inbox',
    request: { params: Id },
    responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
  }),
  listTags: createRoute({
    method: 'get',
    path: '/tags',
    operationId: 'listTags',
    tags: tags.tasks,
    summary: 'Your tags, by name (a task creates the tags it names)',
    responses: { 200: jsonContent(z.array(Tag), 'Tags'), 401: errors[401] },
  }),
  renameTag: createRoute({
    method: 'patch',
    path: '/tags/{id}',
    operationId: 'renameTag',
    tags: tags.tasks,
    summary: 'Rename a tag',
    request: { params: Id, ...jsonBody(TagPatch) },
    responses: { 200: jsonContent(Tag, 'Renamed'), 400: errors[400], 401: errors[401], 404: errors[404] },
  }),
  deleteTag: createRoute({
    method: 'delete',
    path: '/tags/{id}',
    operationId: 'deleteTag',
    tags: tags.tasks,
    summary: 'Delete a tag; it comes off every task',
    request: { params: Id },
    responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
  }),
};

const PATHS = ['/tasks', '/tasks/*', '/projects', '/projects/*', '/tags', '/tags/*'];

/** Task, project and tag routes. Without `deps` (the OpenAPI dump) they're described but answer 401. */
export function tasksApi(deps?: { db: Db; auth: Auth }): OpenAPIHono<UserVars> {
  const app = newApi<UserVars>();
  for (const path of PATHS) app.use(path, requireUser(deps?.auth));

  const db = (): Db => {
    // requireUser answers 401 without deps, so handlers only run with a database.
    if (!deps) throw new Error('task routes ran without a database');
    return deps.db;
  };
  const id = (c: { req: { valid: (k: 'param') => { id: string } } }): string => c.req.valid('param').id;

  return app
    .openapi(r.listTasks, async (c) =>
      c.json((await tasks.listTasks(db(), c.var.userId, c.req.valid('query').completed === 'true')).map(taskOut), 200),
    )
    .openapi(r.createTask, async (c) =>
      c.json(taskOut(await tasks.createTask(db(), c.var.userId, c.req.valid('json'))), 201),
    )
    .openapi(r.updateTask, async (c) =>
      c.json(taskOut(await tasks.updateTask(db(), c.var.userId, id(c), c.req.valid('json'))), 200),
    )
    .openapi(r.completeTask, async (c) => c.json(taskOut(await tasks.completeTask(db(), c.var.userId, id(c))), 200))
    .openapi(r.reopenTask, async (c) => c.json(taskOut(await tasks.reopenTask(db(), c.var.userId, id(c))), 200))
    .openapi(r.scheduleTask, async (c) =>
      c.json(taskOut(await tasks.scheduleTask(db(), c.var.userId, id(c), c.req.valid('json'))), 200),
    )
    .openapi(r.unscheduleTask, async (c) => c.json(taskOut(await tasks.unscheduleTask(db(), c.var.userId, id(c))), 200))
    .openapi(r.deleteTask, async (c) => {
      await tasks.deleteTask(db(), c.var.userId, id(c));
      return c.body(null, 204);
    })
    .openapi(r.listProjects, async (c) =>
      c.json((await projects.listProjects(db(), c.var.userId)).map(projectOut), 200),
    )
    .openapi(r.createProject, async (c) =>
      c.json(projectOut(await projects.createProject(db(), c.var.userId, c.req.valid('json'))), 201),
    )
    .openapi(r.updateProject, async (c) =>
      c.json(projectOut(await projects.updateProject(db(), c.var.userId, id(c), c.req.valid('json'))), 200),
    )
    .openapi(r.deleteProject, async (c) => {
      await projects.deleteProject(db(), c.var.userId, id(c));
      return c.body(null, 204);
    })
    .openapi(r.listTags, async (c) => c.json((await projects.listTags(db(), c.var.userId)).map(tagOut), 200))
    .openapi(r.renameTag, async (c) =>
      c.json(tagOut(await projects.renameTag(db(), c.var.userId, id(c), c.req.valid('json').name)), 200),
    )
    .openapi(r.deleteTag, async (c) => {
      await projects.deleteTag(db(), c.var.userId, id(c));
      return c.body(null, 204);
    });
}
