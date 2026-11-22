// The HTTP app: the /api routes, Better Auth's handler and (in production) the built web app.
import type { Db } from '@homa/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { serveStatic } from 'hono/bun';
import type { Auth } from '@/auth';
import { calendarApi } from '@/calendar';
import { connectionsApi, type SyncSettings } from '@/connections';
import { importExportApi } from '@/import-export';
import { instanceApi } from '@/instance';
import { channelsApi, type NotifySettings, type PushSettings, remindersApi } from '@/reminders';
import { settingsApi } from '@/settings';
import { tasksApi } from '@/tasks';
import { handleError, notFound } from './errors';
import { healthApi } from './health';
import { newApi, openApiConfig } from './openapi';

/**
 * `sync` is the connected-calendar settings, `push` web push and `notify` the notification channels;
 * without them those routes answer 503.
 */
export type AppDeps = { db: Db; auth: Auth; sync?: SyncSettings; push?: PushSettings; notify?: NotifySettings };

/** The /api routes. Without `deps` (tests, the OpenAPI dump) routes that need a user answer 401. */
export function createApi(deps?: AppDeps): OpenAPIHono {
  const api = newApi();
  api.route('/', healthApi());
  api.route('/', calendarApi(deps));
  api.route('/', settingsApi(deps));
  api.route('/', instanceApi(deps));
  api.route('/', importExportApi(deps));
  api.route('/', connectionsApi(deps));
  api.route('/', remindersApi(deps));
  api.route('/', channelsApi(deps));
  api.route('/', tasksApi(deps));
  api.doc31('/openapi.json', openApiConfig);
  api.onError(handleError);
  return api;
}

/**
 * The HTTP app. Without `deps` (tests, the OpenAPI dump) the /api/auth routes are left out.
 * With `webDir` (the built SPA, relative to the working directory) it also serves the web app,
 * falling back to index.html so client-side routes load on refresh.
 */
export function createApp(deps?: AppDeps, webDir?: string): OpenAPIHono {
  const app = newApi();
  const auth = deps?.auth;
  if (auth) app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  app.route('/api', createApi(deps));
  app.all('/api/*', notFound);
  app.onError(handleError);
  if (webDir) {
    app.use(
      '/*',
      serveStatic({
        root: webDir,
        onFound: (path: string, c: Context): void => {
          // Vite fingerprints everything under assets/, so those can be cached for good.
          c.header('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
        },
      }),
    );
    app.get(
      '/*',
      serveStatic({
        path: `${webDir}/index.html`,
        onFound: (_p: string, c: Context): void => c.header('Cache-Control', 'no-cache'),
      }),
    );
  }
  return app;
}
