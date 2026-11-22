// GET /ready: readiness. 200 only when the database answers quickly and has every migration this
// build ships; 503 with the reason otherwise. Uptime monitors and the container healthcheck use it.
import { type Db, pendingMigrations } from '@homa/db';
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { jsonContent, newApi } from './openapi';

/** How long the database gets to answer before the server counts as not ready. */
export const READY_TIMEOUT_MS = 2000;

const Ready = z.object({ status: z.literal('ready') }).openapi('Ready');
const NotReady = z
  .object({
    status: z.literal('not-ready'),
    reason: z.string().openapi({ example: 'the database did not answer within 2 seconds' }),
  })
  .openapi('NotReady');

const readyRoute = createRoute({
  method: 'get',
  path: '/ready',
  operationId: 'getReady',
  tags: ['System'],
  summary: 'Readiness check: the database answers and its migrations are current',
  responses: {
    200: jsonContent(Ready, 'Ready to serve requests'),
    503: jsonContent(NotReady, 'Not ready, and why'),
  },
});

/** Why the server isn't ready, or undefined when it is. */
async function notReadyReason(db: Db | undefined): Promise<string | undefined> {
  if (!db) return 'the server has no database';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), READY_TIMEOUT_MS);
  });
  try {
    const pending = await Promise.race([pendingMigrations(db), timeout]);
    if (pending === 'timeout') return `the database did not answer within ${READY_TIMEOUT_MS / 1000} seconds`;
    if (pending > 0) return `${pending} database migration(s) not applied yet`;
    return undefined;
  } catch {
    return 'the database could not be reached';
  } finally {
    clearTimeout(timer);
  }
}

export function readyApi(db?: Db): OpenAPIHono {
  return newApi().openapi(readyRoute, async (c) => {
    const reason = await notReadyReason(db);
    return reason ? c.json({ status: 'not-ready' as const, reason }, 503) : c.json({ status: 'ready' as const }, 200);
  });
}
