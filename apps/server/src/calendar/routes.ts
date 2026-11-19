// REST routes for calendars, events and occurrences. Every route needs a signed-in user.
import { isTimeZone, parseRrule } from '@homa/core';
import type { Db } from '@homa/db';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { createMiddleware } from 'hono/factory';
import type { Auth } from '../auth';
import * as svc from './service';

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});
const body = <T extends z.ZodType>(schema: T) => ({
  body: { required: true, content: { 'application/json': { schema } } },
});

const ApiError = z.object({ error: z.string() }).openapi('Error');
const errors = {
  400: json(ApiError, 'Invalid request'),
  401: json(ApiError, 'Not signed in'),
  404: json(ApiError, 'Not found'),
};

const Color = z.string().regex(/^#[0-9a-f]{6}$/i, 'a hex color like #4a4e69');
const Calendar = z
  .object({ id: z.uuid(), name: z.string(), color: Color, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() })
  .openapi('Calendar');
const CalendarInput = z
  .object({ name: z.string().trim().min(1).max(100), color: Color.optional() })
  .openapi('CalendarInput');

const Tz = z.string().refine(isTimeZone, 'an IANA time zone like Europe/London').openapi({ example: 'Europe/London' });
const Rrule = z
  .string()
  .max(1000)
  .refine((v) => {
    try {
      parseRrule(v);
      return true;
    } catch {
      return false;
    }
  }, 'an RRULE value like FREQ=WEEKLY;BYDAY=MO')
  .transform((v) => v.replace(/^RRULE:/i, ''))
  .openapi({ example: 'FREQ=WEEKLY;BYDAY=MO' });
const When = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

const Event = z
  .object({
    id: z.uuid(),
    calendarId: z.uuid(),
    uid: z.string(),
    summary: z.string(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    allDay: z.boolean(),
    tz: z.string(),
    rrule: z.string().nullable(),
    exdates: z.array(z.iso.datetime()),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Event');

const fields = {
  calendarId: z.uuid(),
  summary: z.string().max(500),
  description: z.string().max(10_000).nullable(),
  location: z.string().max(500).nullable(),
  start: When,
  end: When,
  allDay: z.boolean(),
  tz: Tz,
  rrule: Rrule.nullable(),
};
const EventInput = z
  .object({
    ...fields,
    description: fields.description.optional(),
    location: fields.location.optional(),
    allDay: fields.allDay.default(false),
    rrule: fields.rrule.optional(),
  })
  .refine((v) => v.end > v.start, { message: 'end must be after start', path: ['end'] })
  .openapi('EventInput');
const EventPatch = z.object(fields).partial().openapi('EventPatch');

const Scope = z.enum(['this', 'following', 'all']).default('all').openapi({
  description: 'For recurring events: one occurrence, this one and the rest, or the whole series',
});
const ScopeQuery = z.object({ scope: Scope, recurrenceId: When.optional() });

const Occurrence = z
  .object({
    eventId: z.uuid(),
    calendarId: z.uuid(),
    recurrenceId: z.iso.datetime(),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    summary: z.string(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    allDay: z.boolean(),
    tz: z.string(),
    recurring: z.boolean(),
    overridden: z.boolean(),
  })
  .openapi('Occurrence');

const MAX_RANGE_DAYS = 400;
const OccurrenceQuery = z
  .object({
    from: When,
    to: When,
    calendarId: z
      .union([z.uuid(), z.array(z.uuid())])
      .optional()
      .transform((v) => (v === undefined ? undefined : [v].flat())),
  })
  .refine((q) => q.to > q.from, { message: 'to must be after from', path: ['to'] })
  .refine((q) => q.to.getTime() - q.from.getTime() <= MAX_RANGE_DAYS * 86_400_000, {
    message: `the range can be at most ${MAX_RANGE_DAYS} days`,
    path: ['to'],
  });

const Id = z.object({ id: z.uuid() });

const calendarOut = (c: Awaited<ReturnType<typeof svc.listCalendars>>[number]) => ({
  id: c.id,
  name: c.name,
  color: c.color,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});
const eventOut = (e: svc.EventRow) => ({
  id: e.id,
  calendarId: e.calendarId,
  uid: e.uid,
  summary: e.summary,
  description: e.description,
  location: e.location,
  start: e.startAt.toISOString(),
  end: e.endAt.toISOString(),
  allDay: e.allDay,
  tz: e.tz,
  rrule: e.rrule,
  exdates: e.exdates.map((d) => d.toISOString()),
  createdAt: e.createdAt.toISOString(),
  updatedAt: e.updatedAt.toISOString(),
});

const tags = { calendars: ['Calendars'], events: ['Events'] };
const r = {
  listCalendars: createRoute({
    method: 'get',
    path: '/calendars',
    operationId: 'listCalendars',
    tags: tags.calendars,
    summary: 'Your calendars',
    responses: { 200: json(z.array(Calendar), 'Calendars, oldest first'), 401: errors[401] },
  }),
  createCalendar: createRoute({
    method: 'post',
    path: '/calendars',
    operationId: 'createCalendar',
    tags: tags.calendars,
    summary: 'Create a calendar',
    request: body(CalendarInput),
    responses: { 201: json(Calendar, 'Created'), 400: errors[400], 401: errors[401] },
  }),
  updateCalendar: createRoute({
    method: 'patch',
    path: '/calendars/{id}',
    operationId: 'updateCalendar',
    tags: tags.calendars,
    summary: 'Rename or recolor a calendar',
    request: { params: Id, ...body(CalendarInput.partial()) },
    responses: { 200: json(Calendar, 'Updated'), ...errors },
  }),
  deleteCalendar: createRoute({
    method: 'delete',
    path: '/calendars/{id}',
    operationId: 'deleteCalendar',
    tags: tags.calendars,
    summary: 'Delete a calendar and its events',
    request: { params: Id },
    responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
  }),
  createEvent: createRoute({
    method: 'post',
    path: '/events',
    operationId: 'createEvent',
    tags: tags.events,
    summary: 'Create an event, optionally recurring',
    request: body(EventInput),
    responses: { 201: json(Event, 'Created'), 400: errors[400], 401: errors[401] },
  }),
  getEvent: createRoute({
    method: 'get',
    path: '/events/{id}',
    operationId: 'getEvent',
    tags: tags.events,
    summary: 'An event (the series, for recurring events)',
    request: { params: Id },
    responses: { 200: json(Event, 'The event'), 401: errors[401], 404: errors[404] },
  }),
  updateEvent: createRoute({
    method: 'patch',
    path: '/events/{id}',
    operationId: 'updateEvent',
    tags: tags.events,
    summary: 'Change an event, one occurrence, or this and following',
    description:
      'With scope=following the series is split: the response is the new series that starts at recurrenceId.',
    request: { params: Id, query: ScopeQuery, ...body(EventPatch) },
    responses: { 200: json(Event, 'The changed event or series'), ...errors },
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
  listOccurrences: createRoute({
    method: 'get',
    path: '/occurrences',
    operationId: 'listOccurrences',
    tags: tags.events,
    summary: 'Every event occurrence in a time range',
    description: `Overlapping [from, to), sorted by start. The range can be at most ${MAX_RANGE_DAYS} days.`,
    request: { query: OccurrenceQuery },
    responses: { 200: json(z.array(Occurrence), 'Occurrences'), 400: errors[400], 401: errors[401] },
  }),
};

type Vars = { Variables: { userId: string } };

/** Calendar routes. Without `deps` (the OpenAPI dump) they're described but answer 401. */
export function calendarApi(deps?: { db: Db; auth: Auth }) {
  const app = new OpenAPIHono<Vars>({
    defaultHook: (result, c) => {
      if (!result.success)
        return c.json({ error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, 400);
    },
  });

  const authed = createMiddleware<Vars>(async (c, next) => {
    const session = deps && (await deps.auth.api.getSession({ headers: c.req.raw.headers }));
    if (!session) return c.json({ error: 'Not signed in' }, 401);
    c.set('userId', session.user.id);
    await next();
  });
  for (const path of ['/calendars', '/calendars/*', '/events', '/events/*', '/occurrences']) app.use(path, authed);

  app.onError((err, c) => {
    if (err instanceof svc.NotFound) return c.json({ error: 'Not found' }, 404);
    if (err instanceof svc.BadRequest) return c.json({ error: err.message }, 400);
    throw err;
  });

  const db = () => {
    if (!deps) throw new Error('no database');
    return deps.db;
  };

  return app
    .openapi(r.listCalendars, async (c) => c.json((await svc.listCalendars(db(), c.var.userId)).map(calendarOut), 200))
    .openapi(r.createCalendar, async (c) =>
      c.json(calendarOut(await svc.createCalendar(db(), c.var.userId, c.req.valid('json'))), 201),
    )
    .openapi(r.updateCalendar, async (c) =>
      c.json(
        calendarOut(await svc.updateCalendar(db(), c.var.userId, c.req.valid('param').id, c.req.valid('json'))),
        200,
      ),
    )
    .openapi(r.deleteCalendar, async (c) => {
      await svc.deleteCalendar(db(), c.var.userId, c.req.valid('param').id);
      return c.body(null, 204);
    })
    .openapi(r.createEvent, async (c) =>
      c.json(eventOut(await svc.createEvent(db(), c.var.userId, c.req.valid('json'))), 201),
    )
    .openapi(r.getEvent, async (c) =>
      c.json(eventOut(await svc.getEvent(db(), c.var.userId, c.req.valid('param').id)), 200),
    )
    .openapi(r.updateEvent, async (c) => {
      const { scope, recurrenceId } = c.req.valid('query');
      const e = await svc.updateEvent(
        db(),
        c.var.userId,
        c.req.valid('param').id,
        c.req.valid('json'),
        scope,
        recurrenceId,
      );
      return c.json(eventOut(e), 200);
    })
    .openapi(r.deleteEvent, async (c) => {
      const { scope, recurrenceId } = c.req.valid('query');
      await svc.deleteEvent(db(), c.var.userId, c.req.valid('param').id, scope, recurrenceId);
      return c.body(null, 204);
    })
    .openapi(r.listOccurrences, async (c) => {
      const { from, to, calendarId } = c.req.valid('query');
      const occ = await svc.listOccurrences(db(), c.var.userId, from, to, calendarId);
      return c.json(
        occ.map((o) => ({
          eventId: o.event.id,
          calendarId: o.event.calendarId,
          recurrenceId: o.recurrenceId.toISOString(),
          start: o.start.toISOString(),
          end: o.end.toISOString(),
          summary: o.summary,
          description: o.description,
          location: o.location,
          allDay: o.event.allDay,
          tz: o.event.tz,
          recurring: o.event.rrule !== null,
          overridden: o.overridden,
        })),
        200,
      );
    });
}
