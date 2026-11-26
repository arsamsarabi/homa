// Demo mode's guard. Everyone shares one account, so nothing a visitor does may leave the server
// (email, channels, web push, connected calendars) or lock the next visitor out (password, email,
// sessions, other accounts, instance settings).
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

export const DEMO_BLOCKED = 'This is turned off in the demo. Install Homa to try it.';

/** The only account changes a visitor makes: signing in and out. */
const AUTH_WRITES = new Set(['/api/auth/sign-in/email', '/api/auth/sign-in/passkey', '/api/auth/sign-out']);
/** Where every write is turned away. */
const READ_ONLY = ['/api/connections', '/api/notification-channels', '/api/push/', '/api/admin/'];

/** Whether demo mode turns this request away. */
export function blockedInDemo(method: string, path: string): boolean {
  const read = method === 'GET' || method === 'HEAD';
  // An allow list: any other Better Auth write (sign-up, password, email, sessions, admin) is out.
  if (path.startsWith('/api/auth/')) return !read && !AUTH_WRITES.has(path);
  // OAuth starts are GETs that send the browser to Google or Microsoft.
  if (path.startsWith('/api/connections/') && path.endsWith('/start')) return true;
  return !read && READ_ONLY.some((p) => path.startsWith(p));
}

/** Answers 403 for what a demo visitor may not do. */
export function demoGuard(): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    if (blockedInDemo(c.req.method, c.req.path)) return c.json({ error: DEMO_BLOCKED }, 403);
    await next();
  });
}
