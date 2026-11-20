// REST routes for the instance: its public face, and the settings only the admin can change.
import type { Db } from '@homa/db';
import { createRoute, type OpenAPIHono, type z } from '@hono/zod-openapi';
import { type Auth, requireAdmin, type UserVars } from '@/auth';
import type { SyncSettings } from '@/connections';
import { errorResponses as errors, jsonBody, jsonContent, newApi } from '@/http/openapi';
import * as instance from './instance-service';
import { InstanceSettings, InstanceSettingsPatch, PublicInstance } from './schemas';

const tags = ['Instance'];
const r = {
  getInstance: createRoute({
    method: 'get',
    path: '/instance',
    operationId: 'getInstance',
    tags,
    summary: "The instance's name, whether sign-ups are open and whether it still needs its admin",
    responses: { 200: jsonContent(PublicInstance, 'The instance') },
  }),
  getInstanceSettings: createRoute({
    method: 'get',
    path: '/admin/instance',
    operationId: 'getInstanceSettings',
    tags,
    summary: "The instance's settings (admin only)",
    responses: { 200: jsonContent(InstanceSettings, 'Settings'), 401: errors[401], 403: errors[403] },
  }),
  updateInstanceSettings: createRoute({
    method: 'patch',
    path: '/admin/instance',
    operationId: 'updateInstanceSettings',
    tags,
    summary: "Change the instance's settings (admin only)",
    request: jsonBody(InstanceSettingsPatch),
    responses: {
      200: jsonContent(InstanceSettings, 'The settings after the change'),
      400: errors[400],
      401: errors[401],
      403: errors[403],
    },
  }),
};

const out = (s: instance.InstanceSettings): z.infer<typeof InstanceSettings> => InstanceSettings.parse(s);

/** Instance routes. Without `deps` (the OpenAPI dump) they're described but don't run. */
export function instanceApi(deps?: { db: Db; auth: Auth; sync?: SyncSettings }): OpenAPIHono<UserVars> {
  const app = newApi<UserVars>();
  app.use('/admin/instance', requireAdmin(deps?.auth));

  const db = (): Db => {
    // requireAdmin answers 401 without deps; the public route is never called without them.
    if (!deps) throw new Error('instance routes ran without a database');
    return deps.db;
  };

  return app
    .openapi(r.getInstance, async (c) =>
      c.json(
        PublicInstance.parse(
          // Each provider needs both its OAuth client and the key its tokens are stored with.
          await instance.getPublicInstance(db(), {
            googleCalendar: Boolean(deps?.sync?.google && deps.sync.key),
            microsoftCalendar: Boolean(deps?.sync?.microsoft && deps.sync.key),
          }),
        ),
        200,
      ),
    )
    .openapi(r.getInstanceSettings, async (c) => c.json(out(await instance.getInstanceSettings(db())), 200))
    .openapi(r.updateInstanceSettings, async (c) =>
      c.json(out(await instance.updateInstanceSettings(db(), c.req.valid('json'))), 200),
    );
}
