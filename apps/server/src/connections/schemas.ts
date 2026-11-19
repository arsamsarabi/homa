// Request and response schemas for connected calendars. A connection's credentials (the feed URL,
// which can hold a private token) are never part of a response.
import { CONNECTION_PROVIDERS, CONNECTION_STATUSES } from '@homa/db/schema';
import { z } from '@hono/zod-openapi';
import { Calendar } from '@/calendar';

export const Connection = z
  .object({
    id: z.uuid(),
    provider: z.enum(CONNECTION_PROVIDERS),
    status: z.enum(CONNECTION_STATUSES),
    lastError: z.string().nullable().openapi({ description: 'Why the last sync failed; null after a good one' }),
    lastSyncedAt: z.iso
      .datetime()
      .nullable()
      .openapi({ description: 'When the last sync ran, whether or not it worked' }),
    createdAt: z.iso.datetime(),
    calendars: z.array(Calendar),
  })
  .openapi('Connection');

const Color = z.string().regex(/^#[0-9a-f]{6}$/i, 'a hex color like #4a4e69');
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
