// Request and response schemas for connected calendars. A connection's credentials (the feed URL,
// which can hold a private token) are never part of a response.
import { CONNECTION_PROVIDERS, CONNECTION_STATUSES } from '@homa/db/schema';
import { z } from '@hono/zod-openapi';
import { Calendar } from '@/calendar';

export const Connection = z
  .object({
    id: z.uuid(),
    provider: z.enum(CONNECTION_PROVIDERS),
    label: z.string().nullable().openapi({
      description:
        'The account, such as "ada on caldav.fastmail.com" or a Google or Microsoft email; null for ICS feeds',
    }),
    syncsTravel: z
      .boolean()
      .openapi({ description: "Travel time syncs with the provider (iCloud); elsewhere it's kept only in Homa" }),
    status: z.enum(CONNECTION_STATUSES),
    lastError: z.string().nullable().openapi({ description: 'Why the last sync failed; null after a good one' }),
    lastSyncedAt: z.iso
      .datetime()
      .nullable()
      .openapi({ description: 'When the last sync ran, whether or not it worked' }),
    notice: z.string().nullable().openapi({
      description: "Something to tell the user that isn't an error, such as a conflict the server's copy won",
    }),
    noticeAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    calendars: z.array(Calendar),
  })
  .openapi('Connection');

const Color = z.string().regex(/^#[0-9a-f]{6}$/i, 'a hex color like #7d7fa3');
const Common = { name: z.string().trim().min(1).max(100).optional(), color: Color.optional() };
export const SubscribeInput = z
  .union([
    z.object({ url: z.string().trim().min(1).max(2000), ...Common }),
    z.object({ holidayId: z.string().max(50), ...Common }),
  ])
  .openapi('SubscribeInput', {
    description: 'An ICS feed by URL (http, https or webcal), or a feed from the holiday catalog by id',
  });

export const HolidayFeed = z
  .object({
    id: z.string(),
    country: z.string(),
    names: z.object({ en: z.string(), fa: z.string() }),
    source: z.string(),
  })
  .openapi('HolidayFeed');

export const CaldavInput = z
  .object({
    serverUrl: z.string().trim().min(1).max(2000).openapi({ example: 'https://caldav.fastmail.com' }),
    username: z.string().trim().min(1).max(200),
    password: z.string().min(1).max(500).openapi({ description: 'An app password for this account' }),
  })
  .openapi('CaldavInput');

export const RemoteCalendar = z
  .object({
    remoteId: z
      .string()
      .openapi({ description: "The calendar's URL on the CalDAV server, or its Google or Microsoft calendar id" }),
    name: z.string().nullable(),
    color: Color.nullable(),
    readOnly: z.boolean().openapi({ description: "You can't change events in it on the server" }),
    selected: z.boolean().openapi({ description: 'It syncs with a local calendar' }),
    missing: z.boolean().openapi({
      description: 'Synced here but gone at the source (deleted, or no longer shared); unchoose it to remove it',
    }),
  })
  .openapi('RemoteCalendar');

export const ChooseCalendarsInput = z
  .object({ remoteIds: z.array(z.string().max(2000)).max(100) })
  .openapi('ChooseCalendarsInput', { description: 'Exactly the remote calendars to sync' });

export const OAuthCallbackQuery = z.object({
  code: z.string().max(2000).optional(),
  state: z.string().max(200).optional(),
  error: z.string().max(200).optional(),
});
