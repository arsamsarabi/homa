// The typed client for the Homa REST API. Only hooks call it.
import { type components, createHomaClient, type HomaClient } from '@homa/api-client';

export type EventInput = components['schemas']['EventInput'];
export type EventPatch = components['schemas']['EventPatch'];

/** Calls fetch at request time (not at import), so tests can swap it out. */
export const homaClient: HomaClient = createHomaClient('/api', {
  fetch: (input: Request): Promise<Response> => globalThis.fetch(input),
});

/** An API failure: the server's error message and the HTTP status. */
export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Unwraps an openapi-fetch result, throwing ApiError with the API's error message. */
export async function unwrap<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await call;
  if (error !== undefined || !response.ok) {
    const message = (error as { error?: unknown } | undefined)?.error;
    throw new ApiError(typeof message === 'string' ? message : response.statusText, response.status);
  }
  return data as T;
}
