// REST routes for people on the instance: the directory, invites and circles. Every route but the
// invite lookup needs a signed-in user; another user's circle is a 404.
import type { Db } from '@homa/db';
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { type Auth, requireUser, type UserVars } from '@/auth';
import { emailLanguage } from '@/auth/emails';
import { errorResponses as errors, jsonBody, jsonContent, newApi } from '@/http/openapi';
import { getInstanceSettings } from '@/instance/instance-service';
import type { NotifySettings } from '@/reminders';
import * as circles from './circles-service';
import * as invites from './invites-service';
import { circleOut, inviteOut } from './responses';
import {
  Circle,
  CircleInput,
  CircleMembers,
  CirclePatch,
  CreatedInvite,
  Id,
  Invite,
  InviteInput,
  InviteLookup,
  InviteLookupQuery,
  Person,
} from './schemas';

const tags = ['People'];
const r = {
  listPeople: createRoute({
    method: 'get',
    path: '/people',
    operationId: 'listPeople',
    tags,
    summary: 'Everyone else on this instance, by name',
    responses: { 200: jsonContent(z.array(Person), 'People'), 401: errors[401] },
  }),
  listInvites: createRoute({
    method: 'get',
    path: '/invites',
    operationId: 'listInvites',
    tags,
    summary: "Your invites, newest first (an admin's lists everyone's)",
    responses: { 200: jsonContent(z.array(Invite), 'Invites'), 401: errors[401] },
  }),
  createInvite: createRoute({
    method: 'post',
    path: '/invites',
    operationId: 'createInvite',
    tags,
    summary: 'Create an invite link (admins, or everyone if the instance allows it)',
    request: jsonBody(InviteInput),
    responses: {
      201: jsonContent(CreatedInvite, 'The invite, with its token (shown only now)'),
      400: errors[400],
      401: errors[401],
      403: errors[403],
    },
  }),
  revokeInvite: createRoute({
    method: 'delete',
    path: '/invites/{id}',
    operationId: 'revokeInvite',
    tags,
    summary: 'Revoke an unused invite (yours, or any for an admin)',
    request: { params: Id },
    responses: { 204: { description: 'Revoked' }, 401: errors[401], 404: errors[404] },
  }),
  lookupInvite: createRoute({
    method: 'get',
    path: '/invite-lookup',
    operationId: 'lookupInvite',
    tags,
    summary: 'Who an invite link is from, for the sign-up page (no session needed)',
    request: { query: InviteLookupQuery },
    responses: { 200: jsonContent(InviteLookup, 'The invite'), 400: errors[400], 404: errors[404] },
  }),
  listCircles: createRoute({
    method: 'get',
    path: '/circles',
    operationId: 'listCircles',
    tags,
    summary: 'Your circles, by name',
    responses: { 200: jsonContent(z.array(Circle), 'Circles'), 401: errors[401] },
  }),
  createCircle: createRoute({
    method: 'post',
    path: '/circles',
    operationId: 'createCircle',
    tags,
    summary: 'Create a circle',
    request: jsonBody(CircleInput),
    responses: { 201: jsonContent(Circle, 'Created'), 400: errors[400], 401: errors[401] },
  }),
  renameCircle: createRoute({
    method: 'patch',
    path: '/circles/{id}',
    operationId: 'renameCircle',
    tags,
    summary: 'Rename a circle',
    request: { params: Id, ...jsonBody(CirclePatch) },
    responses: { 200: jsonContent(Circle, 'Renamed'), 400: errors[400], 401: errors[401], 404: errors[404] },
  }),
  setCircleMembers: createRoute({
    method: 'put',
    path: '/circles/{id}/members',
    operationId: 'setCircleMembers',
    tags,
    summary: "Replace a circle's members",
    request: { params: Id, ...jsonBody(CircleMembers) },
    responses: { 200: jsonContent(Circle, 'Updated'), 400: errors[400], 401: errors[401], 404: errors[404] },
  }),
  deleteCircle: createRoute({
    method: 'delete',
    path: '/circles/{id}',
    operationId: 'deleteCircle',
    tags,
    summary: 'Delete a circle (and the sharing given to it)',
    request: { params: Id },
    responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
  }),
};

const PATHS = ['/people', '/invites', '/invites/*', '/circles', '/circles/*'];

/** People routes. Without `deps` (the OpenAPI dump) they're described but answer 401. */
export function peopleApi(deps?: { db: Db; auth: Auth; notify?: NotifySettings }): OpenAPIHono<UserVars> {
  const app = newApi<UserVars>();
  for (const path of PATHS) app.use(path, requireUser(deps?.auth));

  const db = (): Db => {
    // requireUser answers 401 without deps; the lookup is never called without them.
    if (!deps) throw new Error('people routes ran without a database');
    return deps.db;
  };
  const id = (c: { req: { valid: (k: 'param') => { id: string } } }): string => c.req.valid('param').id;

  return app
    .openapi(r.listPeople, async (c) => c.json(await circles.listPeople(db(), c.var.userId), 200))
    .openapi(r.listInvites, async (c) => c.json((await invites.listInvites(db(), c.var.userId)).map(inviteOut), 200))
    .openapi(r.createInvite, async (c) => {
      const send = deps?.notify?.sendMail;
      const mail = send && {
        send,
        appUrl: deps.notify?.appUrl ?? '',
        language: emailLanguage(c.req.raw, (await getInstanceSettings(db())).defaultLanguage),
      };
      const created = await invites.createInvite(db(), c.var.userId, c.req.valid('json'), mail || undefined);
      return c.json({ ...inviteOut(created), token: created.token }, 201);
    })
    .openapi(r.revokeInvite, async (c) => {
      await invites.revokeInvite(db(), c.var.userId, id(c));
      return c.body(null, 204);
    })
    .openapi(r.lookupInvite, async (c) => c.json(await invites.lookupInvite(db(), c.req.valid('query').token), 200))
    .openapi(r.listCircles, async (c) => c.json((await circles.listCircles(db(), c.var.userId)).map(circleOut), 200))
    .openapi(r.createCircle, async (c) =>
      c.json(circleOut(await circles.createCircle(db(), c.var.userId, c.req.valid('json'))), 201),
    )
    .openapi(r.renameCircle, async (c) =>
      c.json(circleOut(await circles.renameCircle(db(), c.var.userId, id(c), c.req.valid('json').name)), 200),
    )
    .openapi(r.setCircleMembers, async (c) =>
      c.json(circleOut(await circles.setCircleMembers(db(), c.var.userId, id(c), c.req.valid('json').memberIds)), 200),
    )
    .openapi(r.deleteCircle, async (c) => {
      await circles.deleteCircle(db(), c.var.userId, id(c));
      return c.body(null, 204);
    });
}
