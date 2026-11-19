// REST routes for the signed-in user's settings.
import type { Db } from '@homa/db';
import { createRoute, type OpenAPIHono, type z } from '@hono/zod-openapi';
import { type Auth, requireUser, type UserVars } from '@/auth';
import { errorResponses as errors, jsonBody, jsonContent, newApi } from '@/http/openapi';
import { Settings, SettingsPatch } from './schemas';
import * as settings from './settings-service';

const tags = ['Settings'];
const r = {
  getSettings: createRoute({
    method: 'get',
    path: '/settings',
    operationId: 'getSettings',
    tags,
    summary: 'Your settings',
    responses: { 200: jsonContent(Settings, 'Settings'), 401: errors[401] },
  }),
  updateSettings: createRoute({
    method: 'patch',
    path: '/settings',
    operationId: 'updateSettings',
    tags,
    summary: 'Change your settings',
    request: jsonBody(SettingsPatch),
    responses: { 200: jsonContent(Settings, 'The settings after the change'), 400: errors[400], 401: errors[401] },
  }),
};

const out = (row: { homeTz: string | null; secondaryCalendar: string }): z.infer<typeof Settings> =>
  Settings.parse(row);

/** Settings routes. Without `deps` (the OpenAPI dump) they're described but answer 401. */
export function settingsApi(deps?: { db: Db; auth: Auth }): OpenAPIHono<UserVars> {
  const app = newApi<UserVars>();
  app.use('/settings', requireUser(deps?.auth));

  const db = (): Db => {
    // requireUser answers 401 without deps, so handlers only run with a database.
    if (!deps) throw new Error('settings routes ran without a database');
    return deps.db;
  };

  return app
    .openapi(r.getSettings, async (c) => c.json(out(await settings.getSettings(db(), c.var.userId)), 200))
    .openapi(r.updateSettings, async (c) =>
      c.json(out(await settings.updateSettings(db(), c.var.userId, c.req.valid('json'))), 200),
    );
}
