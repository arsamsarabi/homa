// GET /health: cheap liveness, no dependency checks.
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { jsonContent, newApi, version } from './openapi';

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
  responses: { 200: jsonContent(Health, 'The server is up') },
});

export function healthApi(): OpenAPIHono {
  return newApi().openapi(healthRoute, (c) => c.json({ status: 'ok' as const, version }, 200));
}
