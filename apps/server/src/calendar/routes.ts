// REST routes for calendars, events and occurrences. Every route needs a signed-in user; handlers
// only validate (the schemas do it), call a service and map the result.
import type { Db } from '@homa/db';
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { type Auth, requireUser, type UserVars } from '@/auth';
import { errorResponses as errors, jsonBody, jsonContent, newApi } from '@/http/openapi';
import * as calendars from './calendars-service';
import * as events from './events-service';
import { listOccurrences } from './occurrences-service';
import { calendarOut, eventOut, occurrenceOut } from './responses';
import {
  Calendar,
  CalendarInput,
  CalendarPatch,
  Event,
  EventInput,
  EventPatch,
  Id,
  MAX_RANGE_DAYS,
  Occurrence,
  OccurrenceQuery,
  RemindersInput,
  ScopeQuery,
} from './schemas';

const tags = { calendars: ['Calendars'], events: ['Events'] };
const r = {
  listCalendars: createRoute({
    method: 'get',
    path: '/calendars',
    operationId: 'listCalendars',
    tags: tags.calendars,
    summary: 'Your calendars',
    responses: { 200: jsonContent(z.array(Calendar), 'Calendars, oldest first'), 401: errors[401] },
  }),
  createCalendar: createRoute({
    method: 'post',
    path: '/calendars',
    operationId: 'createCalendar',
    tags: tags.calendars,
    summary: 'Create a calendar',
    request: jsonBody(CalendarInput),
    responses: { 201: jsonContent(Calendar, 'Created'), 400: errors[400], 401: errors[401] },
  }),
  updateCalendar: createRoute({
    method: 'patch',
    path: '/calendars/{id}',
    operationId: 'updateCalendar',
    tags: tags.calendars,
    summary: 'Rename, recolor, hide or show a calendar',
    request: { params: Id, ...jsonBody(CalendarPatch) },
    responses: { 200: jsonContent(Calendar, 'Updated'), ...errors },
  }),
  deleteCalendar: createRoute({
    method: 'delete',
    path: '/calendars/{id}',
    operationId: 'deleteCalendar',
    tags: tags.calendars,
    summary: 'Delete a calendar and its events',
    description: 'A subscribed calendar is removed with its connection (DELETE /connections/{id}) instead: 400.',
    request: { params: Id },
    responses: { 204: { description: 'Deleted' }, 400: errors[400], 401: errors[401], 404: errors[404] },
  }),
  createEvent: createRoute({
    method: 'post',
    path: '/events',
    operationId: 'createEvent',
    tags: tags.events,
    summary: 'Create an event, optionally recurring',
    request: jsonBody(EventInput),
    responses: { 201: jsonContent(Event, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
  }),
  getEvent: createRoute({
    method: 'get',
    path: '/events/{id}',
    operationId: 'getEvent',
    tags: tags.events,
    summary: 'An event (the series, for recurring events)',
    request: { params: Id },
    responses: { 200: jsonContent(Event, 'The event'), 401: errors[401], 404: errors[404] },
  }),
  updateEvent: createRoute({
    method: 'patch',
    path: '/events/{id}',
    operationId: 'updateEvent',
    tags: tags.events,
    summary: 'Change an event, one occurrence, or this and following',
    description:
      'With scope=following the series is split: the response is the new series that starts at recurrenceId.',
    request: { params: Id, query: ScopeQuery, ...jsonBody(EventPatch) },
    responses: { 200: jsonContent(Event, 'The changed event or series'), ...errors },
  }),
  deleteEvent: createRoute({
    method: 'delete',
    path: '/events/{id}',
    operationId: 'deleteEvent',
    tags: tags.events,
    summary: 'Delete an event, one occurrence, or this and following',
    request: { params: Id, query: ScopeQuery },
    responses: { 204: { description: 'Deleted' }, ...errors },
  }),
  setEventReminders: createRoute({
    method: 'put',
    path: '/events/{id}/reminders',
    operationId: 'setEventReminders',
    tags: tags.events,
    summary: "Replace an event's reminders",
    description:
      'They apply to every occurrence. On read-only calendars (subscriptions) they stay in Homa; on two-way calendars they sync.',
    request: { params: Id, ...jsonBody(RemindersInput) },
    responses: {
      200: jsonContent(Event, 'The event with its reminders'),
      400: errors[400],
      401: errors[401],
      404: errors[404],
    },
  }),
  listOccurrences: createRoute({
    method: 'get',
    path: '/occurrences',
    operationId: 'listOccurrences',
    tags: tags.events,
    summary: 'Every event occurrence in a time range',
    description: `Overlapping [from, to), sorted by start. The range can be at most ${MAX_RANGE_DAYS} days.`,
    request: { query: OccurrenceQuery },
    responses: { 200: jsonContent(z.array(Occurrence), 'Occurrences'), 400: errors[400], 401: errors[401] },
  }),
};

const PATHS = ['/calendars', '/calendars/*', '/events', '/events/*', '/occurrences'];

/** Calendar routes. Without `deps` (the OpenAPI dump) they're described but answer 401. */
export function calendarApi(deps?: { db: Db; auth: Auth }): OpenAPIHono<UserVars> {
  const app = newApi<UserVars>();
  for (const path of PATHS) app.use(path, requireUser(deps?.auth));

  const db = (): Db => {
    // requireUser answers 401 without deps, so handlers only run with a database.
    if (!deps) throw new Error('calendar routes ran without a database');
    return deps.db;
  };

  return app
    .openapi(r.listCalendars, async (c) =>
      c.json((await calendars.listCalendars(db(), c.var.userId)).map(calendarOut), 200),
    )
    .openapi(r.createCalendar, async (c) =>
      c.json(calendarOut(await calendars.createCalendar(db(), c.var.userId, c.req.valid('json'))), 201),
    )
    .openapi(r.updateCalendar, async (c) => {
      const row = await calendars.updateCalendar(db(), c.var.userId, c.req.valid('param').id, c.req.valid('json'));
      return c.json(calendarOut(row), 200);
    })
    .openapi(r.deleteCalendar, async (c) => {
      await calendars.deleteCalendar(db(), c.var.userId, c.req.valid('param').id);
      return c.body(null, 204);
    })
    .openapi(r.createEvent, async (c) => {
      const { reminders, ...input } = c.req.valid('json');
      const row = await events.createEvent(
        db(),
        c.var.userId,
        {
          ...input,
          description: input.description ?? null,
          location: input.location ?? null,
          rrule: input.rrule ?? null,
        },
        reminders,
      );
      return c.json(eventOut(row), 201);
    })
    .openapi(r.getEvent, async (c) =>
      c.json(eventOut(await events.getEvent(db(), c.var.userId, c.req.valid('param').id)), 200),
    )
    .openapi(r.updateEvent, async (c) => {
      const { scope, recurrenceId } = c.req.valid('query');
      const id = c.req.valid('param').id;
      const row = await events.updateEvent(db(), c.var.userId, id, c.req.valid('json'), scope, recurrenceId);
      return c.json(eventOut(row), 200);
    })
    .openapi(r.deleteEvent, async (c) => {
      const { scope, recurrenceId } = c.req.valid('query');
      await events.deleteEvent(db(), c.var.userId, c.req.valid('param').id, scope, recurrenceId);
      return c.body(null, 204);
    })
    .openapi(r.setEventReminders, async (c) => {
      const row = await events.setEventReminders(
        db(),
        c.var.userId,
        c.req.valid('param').id,
        c.req.valid('json').reminders,
      );
      return c.json(eventOut(row), 200);
    })
    .openapi(r.listOccurrences, async (c) => {
      const { from, to, calendarId } = c.req.valid('query');
      return c.json((await listOccurrences(db(), c.var.userId, from, to, calendarId)).map(occurrenceOut), 200);
    });
}
