// REST routes for connected calendars. Every route needs a signed-in user and only sees their own
// connections; handlers validate, call the service and map the result.
import type { Db } from '@homa/db';
import { caldavProvider, HOLIDAY_CATALOG } from '@homa/sync';
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { type Auth, requireUser, type UserVars } from '@/auth';
import { calendarOut } from '@/calendar';
import { errorResponses as errors, jsonBody, jsonContent, newApi } from '@/http/openapi';
import * as caldav from './caldav-service';
import * as service from './connections-service';
import { finishOAuth, OAUTH_FLOW_TTL_MS, type OAuthProvider, startOAuth } from './oauth-service';
import {
  CaldavInput,
  ChooseCalendarsInput,
  Connection,
  HolidayFeed,
  OAuthCallbackQuery,
  RemoteCalendar,
  SubscribeInput,
} from './schemas';
import { NO_SYNC, type SyncSettings } from './sync-settings';

const tags = ['Connected calendars'];
const Id = z.object({ id: z.uuid() });
const unavailable = jsonContent(z.object({ error: z.string() }), 'HOMA_ENCRYPTION_KEY is not set on the server');
const googleUnavailable = jsonContent(
  z.object({ error: z.string() }),
  'HOMA_ENCRYPTION_KEY, or the Google OAuth client (HOMA_GOOGLE_CLIENT_ID), is not set on the server',
);
const microsoftUnavailable = jsonContent(
  z.object({ error: z.string() }),
  'HOMA_ENCRYPTION_KEY, or the Microsoft app (HOMA_MICROSOFT_CLIENT_ID), is not set on the server',
);
/** Holds the state and PKCE verifier of a Google or Microsoft connect between start and callback. */
const cookieName = (provider: OAuthProvider): string => `homa_${provider}_oauth`;
const cookiePath = (provider: OAuthProvider): string => `/api/connections/${provider}`;
const SETTINGS = '/settings';
const r = {
  listConnections: createRoute({
    method: 'get',
    path: '/connections',
    operationId: 'listConnections',
    tags,
    summary: 'Your connected calendars, with their sync status',
    responses: { 200: jsonContent(z.array(Connection), 'Connections, oldest first'), 401: errors[401] },
  }),
  subscribe: createRoute({
    method: 'post',
    path: '/connections/ics',
    operationId: 'subscribeIcs',
    tags,
    summary: 'Subscribe to an ICS feed',
    description:
      'Fetches the feed, then adds a read-only calendar with its events; it syncs again on a schedule. Feeds on private networks are refused unless the server allows them.',
    request: jsonBody(SubscribeInput),
    responses: { 201: jsonContent(Connection, 'Subscribed'), 400: errors[400], 401: errors[401], 503: unavailable },
  }),
  addCaldav: createRoute({
    method: 'post',
    path: '/connections/caldav',
    operationId: 'addCaldav',
    tags,
    summary: 'Connect a CalDAV account',
    description:
      'Checks the account with an app password (iCloud, Fastmail, Nextcloud and other CalDAV servers) and saves it without calendars; choose them next with PUT /connections/{id}/calendars. The password is stored encrypted and never returned.',
    request: jsonBody(CaldavInput),
    responses: { 201: jsonContent(Connection, 'Connected'), 400: errors[400], 401: errors[401], 503: unavailable },
  }),
  startGoogle: createRoute({
    method: 'get',
    path: '/connections/google/start',
    operationId: 'startGoogle',
    tags,
    summary: 'Connect a Google account: redirects to Google',
    description:
      "Open it in the browser (it isn't an API call): it redirects to Google's consent screen, and Google sends the user back to the callback.",
    responses: { 302: { description: "To Google's consent screen" }, 401: errors[401], 503: googleUnavailable },
  }),
  googleCallback: createRoute({
    method: 'get',
    path: '/connections/google/callback',
    operationId: 'googleCallback',
    tags,
    summary: 'Where Google sends the user back',
    description:
      'Saves the account without calendars and redirects to /settings?google={connection id}, where the user chooses them; on failure to /settings?googleError=denied|state|failed.',
    request: { query: OAuthCallbackQuery },
    responses: { 302: { description: 'Back to the settings page' }, 401: errors[401], 503: googleUnavailable },
  }),
  startMicrosoft: createRoute({
    method: 'get',
    path: '/connections/microsoft/start',
    operationId: 'startMicrosoft',
    tags,
    summary: 'Connect a Microsoft account (Outlook.com or Microsoft 365): redirects to Microsoft',
    description:
      "Open it in the browser (it isn't an API call): it redirects to Microsoft's sign-in and consent, and Microsoft sends the user back to the callback.",
    responses: { 302: { description: "To Microsoft's sign-in" }, 401: errors[401], 503: microsoftUnavailable },
  }),
  microsoftCallback: createRoute({
    method: 'get',
    path: '/connections/microsoft/callback',
    operationId: 'microsoftCallback',
    tags,
    summary: 'Where Microsoft sends the user back',
    description:
      'Saves the account without calendars and redirects to /settings?microsoft={connection id}, where the user chooses them; on failure to /settings?microsoftError=denied|state|failed.',
    request: { query: OAuthCallbackQuery },
    responses: { 302: { description: 'Back to the settings page' }, 401: errors[401], 503: microsoftUnavailable },
  }),
  remoteCalendars: createRoute({
    method: 'get',
    path: '/connections/{id}/remote-calendars',
    operationId: 'listRemoteCalendars',
    tags,
    summary: 'The calendars on a CalDAV, Google or Microsoft account, and which of them sync',
    request: { params: Id },
    responses: {
      200: jsonContent(z.array(RemoteCalendar), 'Calendars that hold events'),
      400: errors[400],
      401: errors[401],
      404: errors[404],
      503: unavailable,
    },
  }),
  chooseCalendars: createRoute({
    method: 'put',
    path: '/connections/{id}/calendars',
    operationId: 'chooseCalendars',
    tags,
    summary: 'Choose which calendars of a CalDAV, Google or Microsoft account sync',
    description:
      'New ones get a local calendar and sync now; ones left out lose their local calendar and its events (nothing on the server is deleted).',
    request: { params: Id, ...jsonBody(ChooseCalendarsInput) },
    responses: {
      200: jsonContent(Connection, 'After the first sync of new calendars'),
      400: errors[400],
      401: errors[401],
      404: errors[404],
      503: unavailable,
    },
  }),
  dismissNotice: createRoute({
    method: 'delete',
    path: '/connections/{id}/notice',
    operationId: 'dismissConnectionNotice',
    tags,
    summary: "Dismiss a connection's notice",
    request: { params: Id },
    responses: { 204: { description: 'Dismissed' }, 401: errors[401], 404: errors[404] },
  }),
  syncNow: createRoute({
    method: 'post',
    path: '/connections/{id}/sync',
    operationId: 'syncConnection',
    tags,
    summary: 'Sync a connection now',
    description: 'Answers with the connection after the sync; a failure shows in its status and lastError.',
    request: { params: Id },
    responses: { 200: jsonContent(Connection, 'After the sync'), 401: errors[401], 404: errors[404], 503: unavailable },
  }),
  deleteConnection: createRoute({
    method: 'delete',
    path: '/connections/{id}',
    operationId: 'deleteConnection',
    tags,
    summary: 'Remove a connection, its calendars and their events',
    request: { params: Id },
    responses: { 204: { description: 'Removed' }, 401: errors[401], 404: errors[404] },
  }),
  holidays: createRoute({
    method: 'get',
    path: '/holiday-calendars',
    operationId: 'listHolidayCalendars',
    tags,
    summary: 'Public-holiday feeds you can subscribe to',
    responses: { 200: jsonContent(z.array(HolidayFeed), 'The catalog'), 401: errors[401] },
  }),
};

const connectionOut = ({ connection: c, calendars }: service.ConnectionView): z.infer<typeof Connection> => ({
  id: c.id,
  provider: c.provider,
  label: c.label,
  // shortcut: the CalDAV host is read from the label ("ada on caldav.icloud.com"), since the server
  // URL is encrypted; store the host in its own column if a provider needs more than the host.
  syncsTravel:
    c.provider === 'caldav' &&
    Boolean(caldavProvider(`https://${c.label?.split(' ').pop() ?? ''}`)?.carries.includes('travelMinutes')),
  status: c.status,
  lastError: c.lastError,
  lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
  notice: c.notice,
  noticeAt: c.noticeAt?.toISOString() ?? null,
  createdAt: c.createdAt.toISOString(),
  calendars: calendars.map((cal) =>
    calendarOut({
      calendar: cal,
      access: 'owner',
      owner: { id: c.ownerUserId, name: '' },
      hidden: cal.hidden,
      color: cal.color,
    }),
  ),
});

/** Connection routes. Without `deps` (the OpenAPI dump) they're described but answer 401. */
export function connectionsApi(deps?: { db: Db; auth: Auth; sync?: SyncSettings }): OpenAPIHono<UserVars> {
  const app = newApi<UserVars>();
  for (const path of ['/connections', '/connections/*', '/holiday-calendars']) app.use(path, requireUser(deps?.auth));
  const settings = deps?.sync ?? NO_SYNC;

  const db = (): Db => {
    // requireUser answers 401 without deps, so handlers only run with a database.
    if (!deps) throw new Error('connection routes ran without a database');
    return deps.db;
  };

  /** Sets the flow cookie and returns where to send the browser. */
  const start = (c: Context<UserVars>, provider: OAuthProvider): string => {
    const { url, cookie } = startOAuth(provider, settings, c.var.userId);
    setCookie(c, cookieName(provider), cookie, {
      path: cookiePath(provider),
      httpOnly: true,
      // Lax, so the cookie comes back on the provider's top-level redirect to the callback.
      sameSite: 'Lax',
      secure: settings[provider]?.redirectUri.startsWith('https:') ?? false,
      maxAge: OAUTH_FLOW_TTL_MS / 1000,
    });
    return url;
  };
  /** Finishes the flow; returns the settings page to go back to, with the outcome. */
  const callback = async (
    c: Context<UserVars>,
    provider: OAuthProvider,
    query: z.infer<typeof OAuthCallbackQuery>,
  ): Promise<string> => {
    const cookie = getCookie(c, cookieName(provider));
    deleteCookie(c, cookieName(provider), { path: cookiePath(provider) });
    const outcome = await finishOAuth(provider, db(), settings, c.var.userId, query, cookie);
    return 'connectionId' in outcome
      ? `${SETTINGS}?${provider}=${outcome.connectionId}`
      : `${SETTINGS}?${provider}Error=${outcome.error}`;
  };

  return app
    .openapi(r.listConnections, async (c) =>
      c.json((await service.listConnections(db(), c.var.userId)).map(connectionOut), 200),
    )
    .openapi(r.subscribe, async (c) =>
      c.json(connectionOut(await service.subscribe(db(), settings, c.var.userId, c.req.valid('json'))), 201),
    )
    .openapi(r.addCaldav, async (c) =>
      c.json(connectionOut(await caldav.addCaldav(db(), settings, c.var.userId, c.req.valid('json'))), 201),
    )
    .openapi(r.startGoogle, (c) => c.redirect(start(c, 'google'), 302))
    .openapi(r.googleCallback, async (c) => c.redirect(await callback(c, 'google', c.req.valid('query')), 302))
    .openapi(r.startMicrosoft, (c) => c.redirect(start(c, 'microsoft'), 302))
    .openapi(r.microsoftCallback, async (c) => c.redirect(await callback(c, 'microsoft', c.req.valid('query')), 302))
    .openapi(r.remoteCalendars, async (c) =>
      c.json(
        (await caldav.listRemoteCalendars(db(), settings, c.var.userId, c.req.valid('param').id)).map((x) => ({
          remoteId: x.remoteId,
          name: x.name,
          color: x.color ?? null,
          readOnly: x.readOnly,
          selected: x.selected,
          missing: x.missing,
        })),
        200,
      ),
    )
    .openapi(r.chooseCalendars, async (c) =>
      c.json(
        connectionOut(
          await caldav.chooseCalendars(
            db(),
            settings,
            c.var.userId,
            c.req.valid('param').id,
            c.req.valid('json').remoteIds,
          ),
        ),
        200,
      ),
    )
    .openapi(r.dismissNotice, async (c) => {
      await service.dismissNotice(db(), c.var.userId, c.req.valid('param').id);
      return c.body(null, 204);
    })
    .openapi(r.syncNow, async (c) =>
      c.json(connectionOut(await service.syncNow(db(), settings, c.var.userId, c.req.valid('param').id)), 200),
    )
    .openapi(r.deleteConnection, async (c) => {
      await service.deleteConnection(db(), c.var.userId, c.req.valid('param').id);
      return c.body(null, 204);
    })
    .openapi(r.holidays, (c) =>
      c.json(
        HOLIDAY_CATALOG.map(({ id, country, names, source }) => ({ id, country, names, source })),
        200,
      ),
    );
}
