// Maps errors to HTTP responses, in one place. Domain errors from @homa/core become 4xx with their
// message; anything else is logged and becomes an opaque 500.
import { NotFoundError, ValidationError } from '@homa/core';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { errorFields, log } from '@/log';

export function handleError(err: Error, c: Context): Response {
  if (err instanceof NotFoundError) return c.json({ error: 'Not found' }, 404);
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  log.error('unhandled error', { method: c.req.method, path: c.req.path, ...errorFields(err) });
  return c.json({ error: 'Internal server error' }, 500);
}

export const notFound = (c: Context): Response => c.json({ error: 'Not found' }, 404);
