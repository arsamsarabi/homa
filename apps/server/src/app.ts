import type { Db } from '@homa/db';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { serveStatic } from 'hono/bun';
import type { Auth } from './auth';
import { calendarApi } from './calendar/routes';

const Health = z
  .object({
    status: z.literal('ok'),
    version: z.string().openapi({ example: '0.0.0' }),
  })
  .openapi('Health');

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  operationId: 'getHealth',
  tags: ['System'],
  summary: 'Liveness check',
  responses: {
    200: { description: 'The server is up', content: { 'application/json': { schema: Health } } },
  },
});

export const version = process.env.HOMA_VERSION ?? '0.0.0';

/** The /api routes. Without `deps` (tests, the OpenAPI dump) routes that need a user answer 401. */
export function createApi(deps?: { db: Db; auth: Auth }) {
  const api = new OpenAPIHono().openapi(healthRoute, (c) => c.json({ status: 'ok' as const, version }, 200));
  api.route('/', calendarApi(deps));
  api.doc31('/openapi.json', openApiConfig);
  return api;
}

export const openApiConfig = {
  openapi: '3.1.0',
  info: { title: 'Homa API', version },
  servers: [{ url: '/api' }],
};

/**
 * The HTTP app. Without `deps` (tests, the OpenAPI dump) the /api/auth routes are left out.
 * With `webDir` (the built SPA, relative to the working directory) it also serves the web app,
 * falling back to index.html so client-side routes load on refresh.
 */
export function createApp(deps?: { db: Db; auth: Auth }, webDir?: string) {
  const app = new OpenAPIHono();
  const auth = deps?.auth;
  if (auth) app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  app.route('/api', createApi(deps));
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));
  if (webDir) {
    app.use(
      '/*',
      serveStatic({
        root: webDir,
        onFound: (path, c) => {
          // Vite fingerprints everything under assets/, so those can be cached for good.
          c.header('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    app.get(
      '/*',
      serveStatic({ path: `${webDir}/index.html`, onFound: (_p, c) => c.header('Cache-Control', 'no-cache') }),
    );
  }
  return app;
}
