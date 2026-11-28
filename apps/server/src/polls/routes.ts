// REST routes for polls and tentative holds. Every route needs a signed-in user; a poll you don't
// organize or take part in is a 404.
import type { Db } from '@homa/db';
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { type Auth, requireUser, type UserVars } from '@/auth';
import { errorResponses as errors, jsonBody, jsonContent, newApi } from '@/http/openapi';
import * as polls from './polls-service';
import { holdOut, pollOut, pollSummaryOut } from './responses';
import {
  AnswerInput,
  FinalizeInput,
  Hold,
  HoldQuery,
  Id,
  Poll,
  PollInput,
  PollListQuery,
  PollPatch,
  PollSummary,
  Prefill,
  ReopenInput,
  SuggestInput,
  Suggestion,
} from './schemas';

const tags = ['Polls'];
const one: Record<200 | 400 | 401 | 403 | 404, ReturnType<typeof jsonContent>> = {
  200: jsonContent(Poll, 'The poll'),
  400: errors[400],
  401: errors[401],
  403: errors[403],
  404: errors[404],
};

const r = {
  list: createRoute({
    method: 'get',
    path: '/polls',
    operationId: 'listPolls',
    tags,
    summary: 'Polls you organize (mine), open ones you are asked to answer (answer), or finished ones (past)',
    request: { query: PollListQuery },
    responses: { 200: jsonContent(z.array(PollSummary), 'Polls'), 400: errors[400], 401: errors[401] },
  }),
  create: createRoute({
    method: 'post',
    path: '/polls',
    operationId: 'createPoll',
    tags,
    summary: 'Create a draft poll; you are always in it, and required',
    request: jsonBody(PollInput),
    responses: { 201: jsonContent(Poll, 'Created'), 400: errors[400], 401: errors[401] },
  }),
  suggest: createRoute({
    method: 'post',
    path: '/polls/suggest',
    operationId: 'suggestPollSlots',
    tags,
    summary: 'Up to 10 times when the required people are free, most others free first',
    request: jsonBody(SuggestInput),
    responses: { 200: jsonContent(z.array(Suggestion), 'Suggestions'), 400: errors[400], 401: errors[401] },
  }),
  get: createRoute({
    method: 'get',
    path: '/polls/{id}',
    operationId: 'getPoll',
    tags,
    summary: 'A poll with its times, people, everyone’s answers and the results',
    request: { params: Id },
    responses: { 200: jsonContent(Poll, 'The poll'), 401: errors[401], 404: errors[404] },
  }),
  update: createRoute({
    method: 'patch',
    path: '/polls/{id}',
    operationId: 'updatePoll',
    tags,
    summary: 'Change a poll (organizer); the length only while it is a draft',
    request: { params: Id, ...jsonBody(PollPatch) },
    responses: one,
  }),
  remove: createRoute({
    method: 'delete',
    path: '/polls/{id}',
    operationId: 'deletePoll',
    tags,
    summary: 'Delete a draft or finished poll, or cancel one that is out',
    request: { params: Id },
    responses: { 204: { description: 'Deleted or cancelled' }, 401: errors[401], 403: errors[403], 404: errors[404] },
  }),
  open: createRoute({
    method: 'post',
    path: '/polls/{id}/open',
    operationId: 'openPoll',
    tags,
    summary: 'Send the poll to its people',
    request: { params: Id },
    responses: one,
  }),
  close: createRoute({
    method: 'post',
    path: '/polls/{id}/close',
    operationId: 'closePoll',
    tags,
    summary: 'Stop taking answers',
    request: { params: Id },
    responses: one,
  }),
  reopen: createRoute({
    method: 'post',
    path: '/polls/{id}/reopen',
    operationId: 'reopenPoll',
    tags,
    summary: 'Take answers again, with a new deadline',
    request: { params: Id, ...jsonBody(ReopenInput) },
    responses: one,
  }),
  finalize: createRoute({
    method: 'post',
    path: '/polls/{id}/finalize',
    operationId: 'finalizePoll',
    tags,
    summary: 'Set the time: your event in calendarId and a copy for each person who ranked it',
    request: { params: Id, ...jsonBody(FinalizeInput) },
    responses: one,
  }),
  answer: createRoute({
    method: 'put',
    path: '/polls/{id}/answers',
    operationId: 'answerPoll',
    tags,
    summary: 'Your answer: the times you can make, best first, and the ones you can’t',
    request: { params: Id, ...jsonBody(AnswerInput) },
    responses: one,
  }),
  prefill: createRoute({
    method: 'get',
    path: '/polls/{id}/prefill',
    operationId: 'getPollPrefill',
    tags,
    summary: 'The times that clash with your calendars: where your answer starts them',
    request: { params: Id },
    responses: { 200: jsonContent(Prefill, 'Clashing times'), 401: errors[401], 404: errors[404] },
  }),
  holds: createRoute({
    method: 'get',
    path: '/holds',
    operationId: 'listHolds',
    tags,
    summary: 'Your tentative holds from open polls in a range',
    request: { query: HoldQuery },
    responses: { 200: jsonContent(z.array(Hold), 'Holds'), 400: errors[400], 401: errors[401] },
  }),
};

/** Poll and hold routes. Without `deps` (the OpenAPI dump) they're described but answer 401. */
export function pollsApi(deps?: { db: Db; auth: Auth }): OpenAPIHono<UserVars> {
  const app = newApi<UserVars>();
  for (const path of ['/polls', '/polls/*', '/holds']) app.use(path, requireUser(deps?.auth));
  const db = (): Db => {
    if (!deps) throw new Error('poll routes ran without a database');
    return deps.db;
  };
  const id = (c: { req: { valid: (k: 'param') => { id: string } } }): string => c.req.valid('param').id;

  return app
    .openapi(r.list, async (c) =>
      c.json(
        (await polls.listPolls(db(), c.var.userId, c.req.valid('query').view)).map((p) =>
          pollSummaryOut(p, c.var.userId),
        ),
        200,
      ),
    )
    .openapi(r.create, async (c) =>
      c.json(pollOut(await polls.createPoll(db(), c.var.userId, c.req.valid('json'))), 201),
    )
    .openapi(r.suggest, async (c) => {
      const list = await polls.suggest(db(), c.var.userId, c.req.valid('json'));
      return c.json(
        list.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), busy: s.busy })),
        200,
      );
    })
    .openapi(r.get, async (c) => c.json(pollOut(await polls.getPoll(db(), c.var.userId, id(c))), 200))
    .openapi(r.update, async (c) =>
      c.json(pollOut(await polls.updatePoll(db(), c.var.userId, id(c), c.req.valid('json'))), 200),
    )
    .openapi(r.remove, async (c) => {
      await polls.deletePoll(db(), c.var.userId, id(c));
      return c.body(null, 204);
    })
    .openapi(r.open, async (c) => c.json(pollOut(await polls.openPoll(db(), c.var.userId, id(c))), 200))
    .openapi(r.close, async (c) => c.json(pollOut(await polls.closePoll(db(), c.var.userId, id(c))), 200))
    .openapi(r.reopen, async (c) =>
      c.json(pollOut(await polls.reopenPoll(db(), c.var.userId, id(c), c.req.valid('json').deadline)), 200),
    )
    .openapi(r.finalize, async (c) =>
      c.json(pollOut(await polls.finalizePoll(db(), c.var.userId, id(c), c.req.valid('json'))), 200),
    )
    .openapi(r.answer, async (c) =>
      c.json(pollOut(await polls.answerPoll(db(), c.var.userId, id(c), c.req.valid('json'))), 200),
    )
    .openapi(r.prefill, async (c) => c.json({ cannot: await polls.prefill(db(), c.var.userId, id(c)) }, 200))
    .openapi(r.holds, async (c) => {
      const q = c.req.valid('query');
      return c.json((await polls.listHolds(db(), c.var.userId, q.from, q.to)).map(holdOut), 200);
    });
}
