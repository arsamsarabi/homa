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

/** The admin plugin's role on the session user (kept as a narrow read so plugin composition stays typed). */
function sessionRole(user: object): string | undefined {
  return 'role' in user && typeof user.role === 'string' ? user.role : undefined;
}

/** Like requireUser, but only for the instance's admins: 401 signed out, 403 for everyone else. */
export function requireAdmin(auth: Auth | undefined): MiddlewareHandler<UserVars> {
  return createMiddleware<UserVars>(async (c, next) => {
    const session = auth && (await auth.api.getSession({ headers: c.req.raw.headers }));
    if (!session) return c.json({ error: 'Not signed in' }, 401);
    // The role comes from the users row on every request, never from the client.
    if (sessionRole(session.user) !== 'admin') return c.json({ error: 'Only an admin can do that' }, 403);
    c.set('userId', session.user.id);
    await next();
  });
}
