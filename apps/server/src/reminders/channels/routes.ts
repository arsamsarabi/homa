// REST routes for a user's notification channels. Every route needs a signed-in user; another
// user's channel is a 404.
import type { Db } from '@homa/db';
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { type Auth, requireUser, type UserVars } from '@/auth';
import { errorResponses as errors, jsonBody, jsonContent, newApi } from '@/http/openapi';
import { Id } from '@/reminders/schemas';
import { Channel, ChannelInput, ChannelList, ChannelPatch, TestResult } from './schemas';
import * as channels from './service';
import type { NotifySettings } from './settings';

const tags = ['Notifications'];
const unavailable = jsonContent(z.object({ error: z.string() }), 'Not set up on this server');
const r = {
  list: createRoute({
    method: 'get',
    path: '/notification-channels',
    operationId: 'listNotificationChannels',
    tags,
    summary: 'Your notification channels, and whether this server can send email',
    responses: { 200: jsonContent(ChannelList, 'Channels'), 401: errors[401], 503: unavailable },
  }),
  create: createRoute({
    method: 'post',
    path: '/notification-channels',
    operationId: 'createNotificationChannel',
    tags,
    summary: "Add an email, ntfy, Gotify or webhook channel (a webhook's secret is in this answer only)",
    request: jsonBody(ChannelInput),
    responses: { 201: jsonContent(Channel, 'Created'), 400: errors[400], 401: errors[401], 503: unavailable },
  }),
  update: createRoute({
    method: 'patch',
    path: '/notification-channels/{id}',
    operationId: 'updateNotificationChannel',
    tags,
    summary: 'Change a channel; omitted tokens are kept',
    request: { params: Id, ...jsonBody(ChannelPatch) },
    responses: {
      200: jsonContent(Channel, 'Updated'),
      400: errors[400],
      401: errors[401],
      404: errors[404],
      503: unavailable,
    },
  }),
  delete: createRoute({
    method: 'delete',
    path: '/notification-channels/{id}',
    operationId: 'deleteNotificationChannel',
    tags,
    summary: 'Remove a channel',
    request: { params: Id },
    responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
  }),
  test: createRoute({
    method: 'post',
    path: '/notification-channels/{id}/test',
    operationId: 'testNotificationChannel',
    tags,
    summary: 'Send a test message now',
    request: { params: Id },
    responses: {
      200: jsonContent(TestResult, 'Sent, or why not'),
      401: errors[401],
      404: errors[404],
      503: unavailable,
    },
  }),
};

/** Channel routes. Without `deps` (the OpenAPI dump) they're described but answer 401. */
export function channelsApi(deps?: { db: Db; auth: Auth; notify?: NotifySettings }): OpenAPIHono<UserVars> {
  const app = newApi<UserVars>();
  for (const path of ['/notification-channels', '/notification-channels/*']) app.use(path, requireUser(deps?.auth));
  const db = (): Db => {
    if (!deps) throw new Error('channel routes ran without a database');
    return deps.db;
  };
  return app
    .openapi(r.list, async (c) => c.json(await channels.listChannels(db(), deps?.notify, c.var.userId), 200))
    .openapi(r.create, async (c) =>
      c.json(await channels.createChannel(db(), deps?.notify, c.var.userId, c.req.valid('json')), 201),
    )
    .openapi(r.update, async (c) =>
      c.json(
        await channels.updateChannel(db(), deps?.notify, c.var.userId, c.req.valid('param').id, c.req.valid('json')),
        200,
      ),
    )
    .openapi(r.delete, async (c) => {
      await channels.deleteChannel(db(), c.var.userId, c.req.valid('param').id);
      return c.body(null, 204);
    })
    .openapi(r.test, async (c) =>
      c.json(await channels.testChannel(db(), deps?.notify, c.var.userId, c.req.valid('param').id), 200),
    );
}
