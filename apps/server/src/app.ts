import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Auth } from './auth';

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

export const api = new OpenAPIHono().openapi(healthRoute, (c) => c.json({ status: 'ok' as const, version }, 200));

export const openApiConfig = {
  openapi: '3.1.0',
  info: { title: 'Homa API', version },
  servers: [{ url: '/api' }],
};

api.doc31('/openapi.json', openApiConfig);

/** The HTTP app. Without `auth` (tests, the OpenAPI dump) the /api/auth routes are left out. */
export function createApp(auth?: Auth) {
  const app = new OpenAPIHono();
  if (auth) app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  return app.route('/api', api);
}
