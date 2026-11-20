// Request and response schemas for notification channels.
import { CHANNEL_KINDS, REMINDER_KINDS } from '@homa/db';
import { z } from '@hono/zod-openapi';

const Name = z.string().trim().min(1).max(100);
const Kinds = z
  .array(z.enum(REMINDER_KINDS))
  .min(1)
  .transform((v) => [...new Set(v)])
  .openapi({ description: 'Which reminders it gets: event reminders, standalone ones, or both' });
const Address = z.string().trim().min(1).max(2000);
const Token = z.string().trim().min(1).max(500);
const Topic = z
  .string()
  .regex(/^[\w-]{1,64}$/, 'letters, digits, - and _ only, at most 64')
  .openapi({ example: 'homa-reminders-3f9a' });

// biome-ignore lint/nursery/useExplicitType: spread into each kind's object; zod infers the shape.
const common = { name: Name, reminderKinds: Kinds.optional() };

export const ChannelInput = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('email'), ...common }),
    z.object({
      kind: z.literal('ntfy'),
      ...common,
      server: Address.default('https://ntfy.sh'),
      topic: Topic,
      token: Token.optional(),
    }),
    z.object({ kind: z.literal('gotify'), ...common, server: Address, token: Token }),
    z.object({ kind: z.literal('webhook'), ...common, url: Address }),
  ])
  .openapi('NotificationChannelInput');

export const ChannelPatch = z
  .object({
    name: Name,
    enabled: z.boolean(),
    reminderKinds: Kinds,
    server: Address,
    topic: Topic,
    token: Token.nullable().openapi({ description: 'Omit to keep it; null removes an ntfy token' }),
    url: Address,
    rotateSecret: z.boolean().openapi({ description: "A webhook's new signing secret, shown in the answer" }),
  })
  .partial()
  .openapi('NotificationChannelPatch');

export const Channel = z
  .object({
    id: z.uuid(),
    kind: z.enum(CHANNEL_KINDS),
    name: z.string(),
    enabled: z.boolean(),
    reminderKinds: z.array(z.enum(REMINDER_KINDS)),
    server: z.string().nullable().openapi({ description: 'ntfy and Gotify' }),
    topic: z.string().nullable().openapi({ description: 'ntfy' }),
    host: z.string().nullable().openapi({ description: "A webhook's host (the full address is secret)" }),
    hasToken: z.boolean(),
    failing: z.boolean().openapi({ description: 'The last 3 or more sends failed' }),
    lastError: z.string().nullable(),
    lastErrorAt: z.iso.datetime().nullable(),
    lastSentAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    secret: z.string().optional().openapi({ description: "A webhook's signing secret: only when created or rotated" }),
  })
  .openapi('NotificationChannel');

export const ChannelList = z
  .object({
    items: z.array(Channel),
    email: z.boolean().openapi({ description: 'Whether this server can send email (SMTP is set up)' }),
  })
  .openapi('NotificationChannelList');

export const TestResult = z
  .object({ ok: z.boolean(), error: z.string().optional() })
  .openapi('NotificationChannelTestResult');
