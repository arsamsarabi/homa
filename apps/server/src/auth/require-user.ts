// Middleware for routes that need a signed-in user: sets c.var.userId or answers 401.

import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Auth } from './auth';

export type UserVars = { Variables: { userId: string } };

/** Without `auth` (the OpenAPI dump, tests without a database) every request is signed out. */
export function requireUser(auth: Auth | undefined): MiddlewareHandler<UserVars> {
  return createMiddleware<UserVars>(async (c, next) => {
    const session = auth && (await auth.api.getSession({ headers: c.req.raw.headers }));
    if (!session) return c.json({ error: 'Not signed in' }, 401);
    c.set('userId', session.user.id);
    await next();
  });
}
