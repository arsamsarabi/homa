// REST routes for importing an .ics file into a calendar and downloading all of your data.
import { ICS_LIMITS, ValidationError } from '@homa/core';
import type { Db } from '@homa/db';
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { type Auth, requireUser, type UserVars } from '@/auth';
import { errorResponses as errors, jsonContent, newApi } from '@/http/openapi';
import { exportData } from './export-service';
import { importIcs } from './import-service';
import { DataExport, IcsBody, ImportSummary } from './schemas';

const tags = ['Import and export'];
const r = {
  importIcs: createRoute({
    method: 'post',
    path: '/calendars/{id}/import',
    operationId: 'importIcs',
    tags,
    summary: 'Import an .ics file into one of your calendars',
    description:
      'Events are matched by UID within the calendar, so importing the same file again updates them. Alarms, attachments and X- properties are ignored, and nothing in the file is fetched.',
    middleware: [
      bodyLimit({
        maxSize: ICS_LIMITS.maxBytes,
        onError: (): never => {
          throw new ValidationError(`The file is larger than ${ICS_LIMITS.maxBytes / 1024 / 1024} MB`);
        },
      }),
    ] as const,
    request: {
      params: z.object({ id: z.uuid() }),
      body: { required: true, content: { 'text/calendar': { schema: IcsBody } } },
    },
    responses: { 200: jsonContent(ImportSummary, 'What was imported'), ...errors },
  }),
  exportData: createRoute({
    method: 'get',
    path: '/export',
    operationId: 'exportData',
    tags,
    summary: 'Download all of your data as JSON',
    description: 'Settings, calendars, and events with their recurrence rules and overrides, as an attachment.',
    responses: { 200: jsonContent(DataExport, 'The export'), 401: errors[401] },
  }),
};

const attachment = (now: Date): string => `attachment; filename="homa-export-${now.toISOString().slice(0, 10)}.json"`;

/** Import and export routes. Without `deps` (the OpenAPI dump) they're described but answer 401. */
export function importExportApi(deps?: { db: Db; auth: Auth }): OpenAPIHono<UserVars> {
  const app = newApi<UserVars>();
  for (const path of ['/calendars/:id/import', '/export']) app.use(path, requireUser(deps?.auth));

  const db = (): Db => {
    // requireUser answers 401 without deps, so handlers only run with a database.
    if (!deps) throw new Error('import and export routes ran without a database');
    return deps.db;
  };

  return app
    .openapi(r.importIcs, async (c) =>
      c.json(await importIcs(db(), c.var.userId, c.req.valid('param').id, await c.req.text()), 200),
    )
    .openapi(r.exportData, async (c) => {
      const now = new Date();
      return c.json(await exportData(db(), c.var.userId, now), 200, { 'Content-Disposition': attachment(now) });
    });
}
