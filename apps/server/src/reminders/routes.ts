// REST routes for standalone reminders, notifications (the bell) and web push subscriptions. Every
// route needs a signed-in user; another user's reminder or notification is a 404.
import type { Db } from '@homa/db';
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { type Auth, requireUser, type UserVars } from '@/auth';
import { errorResponses as errors, jsonBody, jsonContent, newApi } from '@/http/openapi';
import * as notifications from './notifications-service';
import type { PushSettings } from './push';
import * as push from './push';
import * as reminders from './reminders-service';
import { notificationOut, reminderOut } from './responses';
import {
  Id,
  Notification,
  NotificationList,
  PushKey,
  PushSubscriptionInput,
  PushUnsubscribe,
  Reminder,
  ReminderInput,
  ReminderPatch,
  SnoozeInput,
} from './schemas';

const tags = { reminders: ['Reminders'], notifications: ['Notifications'] };
const unavailable = jsonContent(z.object({ error: z.string() }), 'Web push is not set up');
const r = {
  listReminders: createRoute({
    method: 'get',
    path: '/reminders',
    operationId: 'listReminders',
    tags: tags.reminders,
    summary: 'Your standalone reminders that are not done, soonest first',
    responses: { 200: jsonContent(z.array(Reminder), 'Reminders'), 401: errors[401] },
  }),
  createReminder: createRoute({
    method: 'post',
    path: '/reminders',
    operationId: 'createReminder',
    tags: tags.reminders,
    summary: 'Create a standalone reminder, optionally repeating',
    request: jsonBody(ReminderInput),
    responses: { 201: jsonContent(Reminder, 'Created'), 400: errors[400], 401: errors[401] },
  }),
  updateReminder: createRoute({
    method: 'patch',
    path: '/reminders/{id}',
    operationId: 'updateReminder',
    tags: tags.reminders,
    summary: 'Change a standalone reminder',
    request: { params: Id, ...jsonBody(ReminderPatch) },
    responses: { 200: jsonContent(Reminder, 'Updated'), 400: errors[400], 401: errors[401], 404: errors[404] },
  }),
  deleteReminder: createRoute({
    method: 'delete',
    path: '/reminders/{id}',
    operationId: 'deleteReminder',
    tags: tags.reminders,
    summary: 'Delete a standalone reminder',
    request: { params: Id },
    responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
  }),
  listNotifications: createRoute({
    method: 'get',
    path: '/notifications',
    operationId: 'listNotifications',
    tags: tags.notifications,
    summary: 'Open notifications (not done, not snoozed), newest first, and how many are unread',
    responses: { 200: jsonContent(NotificationList, 'Notifications'), 401: errors[401] },
  }),
  readNotifications: createRoute({
    method: 'post',
    path: '/notifications/read',
    operationId: 'readNotifications',
    tags: tags.notifications,
    summary: 'Mark every open notification read',
    responses: { 204: { description: 'Done' }, 401: errors[401] },
  }),
  clearNotifications: createRoute({
    method: 'post',
    path: '/notifications/clear',
    operationId: 'clearNotifications',
    tags: tags.notifications,
    summary: 'Clear every open notification (one-off standalone reminders are done with them; tasks stay open)',
    responses: { 204: { description: 'Cleared' }, 401: errors[401] },
  }),
  snoozeNotification: createRoute({
    method: 'post',
    path: '/notifications/{id}/snooze',
    operationId: 'snoozeNotification',
    tags: tags.notifications,
    summary: 'Hide a notification for some minutes or until a time; then it comes back',
    request: { params: Id, ...jsonBody(SnoozeInput) },
    responses: { 200: jsonContent(Notification, 'Snoozed'), 400: errors[400], 401: errors[401], 404: errors[404] },
  }),
  doneNotification: createRoute({
    method: 'post',
    path: '/notifications/{id}/done',
    operationId: 'doneNotification',
    tags: tags.notifications,
    summary: 'Mark a notification done (a one-off standalone reminder is done with it)',
    request: { params: Id },
    responses: { 200: jsonContent(Notification, 'Done'), 401: errors[401], 404: errors[404] },
  }),
  pushKey: createRoute({
    method: 'get',
    path: '/push/key',
    operationId: 'getPushKey',
    tags: tags.notifications,
    summary: "The server's VAPID public key, to subscribe a browser to web push",
    responses: { 200: jsonContent(PushKey, 'The key'), 401: errors[401], 503: unavailable },
  }),
  subscribePush: createRoute({
    method: 'post',
    path: '/push/subscriptions',
    operationId: 'subscribePush',
    tags: tags.notifications,
    summary: "Save this browser's push subscription",
    request: jsonBody(PushSubscriptionInput),
    responses: { 204: { description: 'Saved' }, 400: errors[400], 401: errors[401], 503: unavailable },
  }),
  unsubscribePush: createRoute({
    method: 'delete',
    path: '/push/subscriptions',
    operationId: 'unsubscribePush',
    tags: tags.notifications,
    summary: "Remove this browser's push subscription",
    request: jsonBody(PushUnsubscribe),
    responses: { 204: { description: 'Removed' }, 400: errors[400], 401: errors[401] },
  }),
};

const PATHS = ['/reminders', '/reminders/*', '/notifications', '/notifications/*', '/push/*'];
const MINUTE = 60_000;

/** Reminder and notification routes. Without `deps` (the OpenAPI dump) they're described but answer 401. */
export function remindersApi(deps?: { db: Db; auth: Auth; push?: PushSettings }): OpenAPIHono<UserVars> {
  const app = newApi<UserVars>();
  for (const path of PATHS) app.use(path, requireUser(deps?.auth));

  const db = (): Db => {
    // requireUser answers 401 without deps, so handlers only run with a database.
    if (!deps) throw new Error('reminder routes ran without a database');
    return deps.db;
  };

  return app
    .openapi(r.listReminders, async (c) =>
      c.json((await reminders.listReminders(db(), c.var.userId)).map(reminderOut), 200),
    )
    .openapi(r.createReminder, async (c) => {
      const input = c.req.valid('json');
      const row = await reminders.createReminder(db(), c.var.userId, { ...input, rrule: input.rrule ?? null });
      return c.json(reminderOut(row), 201);
    })
    .openapi(r.updateReminder, async (c) => {
      const row = await reminders.updateReminder(db(), c.var.userId, c.req.valid('param').id, c.req.valid('json'));
      return c.json(reminderOut(row), 200);
    })
    .openapi(r.deleteReminder, async (c) => {
      await reminders.deleteReminder(db(), c.var.userId, c.req.valid('param').id);
      return c.body(null, 204);
    })
    .openapi(r.listNotifications, async (c) => {
      const { items, unread } = await notifications.listNotifications(db(), c.var.userId);
      return c.json({ items: items.map(notificationOut), unread }, 200);
    })
    .openapi(r.readNotifications, async (c) => {
      await notifications.markAllRead(db(), c.var.userId);
      return c.body(null, 204);
    })
    .openapi(r.clearNotifications, async (c) => {
      await notifications.clearAll(db(), c.var.userId);
      return c.body(null, 204);
    })
    .openapi(r.snoozeNotification, async (c) => {
      const { minutes, until } = c.req.valid('json');
      const when = until ?? new Date(Date.now() + (minutes ?? 10) * MINUTE);
      return c.json(
        notificationOut(await notifications.snooze(db(), c.var.userId, c.req.valid('param').id, when)),
        200,
      );
    })
    .openapi(r.doneNotification, async (c) =>
      c.json(notificationOut(await notifications.done(db(), c.var.userId, c.req.valid('param').id)), 200),
    )
    .openapi(r.pushKey, async (c) => c.json({ publicKey: await push.publicKey(deps?.push) }, 200))
    .openapi(r.subscribePush, async (c) => {
      await push.subscribe(db(), deps?.push, c.var.userId, c.req.valid('json'));
      return c.body(null, 204);
    })
    .openapi(r.unsubscribePush, async (c) => {
      await push.unsubscribe(db(), c.var.userId, c.req.valid('json').endpoint);
      return c.body(null, 204);
    });
}
