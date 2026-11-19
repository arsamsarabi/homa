// Shared OpenAPI setup: the document info and the Hono factory every route module uses, so
// request validation failures all answer 400 with the same error shape.
import { OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context, Env } from 'hono';

export const version: string = process.env.HOMA_VERSION ?? '0.0.0';

export const openApiConfig: { openapi: '3.1.0'; info: { title: string; version: string }; servers: { url: string }[] } =
  {
    openapi: '3.1.0',
    info: { title: 'Homa API', version },
    servers: [{ url: '/api' }],
  };

/** The error body every failed request gets. */
export const ApiError = z.object({ error: z.string() }).openapi('Error');

export const jsonContent = <T extends z.ZodType>(
  schema: T,
  description: string,
): { description: string; content: { 'application/json': { schema: T } } } => ({
  description,
  content: { 'application/json': { schema } },
});

export const jsonBody = <T extends z.ZodType>(
  schema: T,
): { body: { required: true; content: { 'application/json': { schema: T } } } } => ({
  body: { required: true, content: { 'application/json': { schema } } },
});

export const errorResponses = {
  400: jsonContent(ApiError, 'Invalid request'),
  401: jsonContent(ApiError, 'Not signed in'),
  403: jsonContent(ApiError, 'Not allowed'),
  404: jsonContent(ApiError, 'Not found'),
};

function validationHook(
  result: { success: true } | { success: false; error: z.ZodError },
  c: Context,
): Response | undefined {
  if (result.success) return undefined;
  return c.json({ error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, 400);
}

/** A route module. Invalid params, queries and bodies answer 400 listing each problem. */
export function newApi<E extends Env = Env>(): OpenAPIHono<E> {
  return new OpenAPIHono<E>({
    defaultHook: validationHook,
  });
}
