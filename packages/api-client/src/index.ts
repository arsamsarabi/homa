import createClient from 'openapi-fetch';
import type { paths } from './schema';

export type { components, paths } from './schema';

/** Typed client for the Homa REST API. `baseUrl` is the API root, e.g. `/api`. */
export function createHomaClient(baseUrl = '/api', init?: { fetch?: typeof fetch; headers?: Record<string, string> }) {
  return createClient<paths>({ baseUrl, ...init });
}
