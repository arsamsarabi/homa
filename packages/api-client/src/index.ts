import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './schema';

export type { components, paths } from './schema';

/** Typed client for the Homa REST API. `baseUrl` is the API root, e.g. `/api`. */
export type HomaClient = Client<paths>;

export function createHomaClient(
  baseUrl = '/api',
  init?: { fetch?: (input: Request) => Promise<Response>; headers?: Record<string, string> },
): HomaClient {
  return createClient<paths>({ baseUrl, ...init });
}
