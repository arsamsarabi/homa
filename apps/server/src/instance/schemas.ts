// Request and response shapes for the instance's settings.
import { isTimeZone } from '@homa/core';
import { z } from '@hono/zod-openapi';
import { SECONDARY_CALENDARS } from '@/settings/schemas';

export const SIGN_UPS = ['open', 'closed'] as const;
export const LANGUAGES = ['en', 'fa'] as const;

const Name = z.string().trim().min(1).max(60).openapi({ example: 'Homa', description: "The instance's name" });
const Language = z.enum(LANGUAGES).openapi({ description: "The web app's language until someone picks one" });

/** What anyone can see, signed in or not. */
export const PublicInstance = z
  .object({
    name: Name,
    signUpsOpen: z.boolean().openapi({ description: 'Whether new accounts can sign up' }),
    needsSetup: z.boolean().openapi({ description: 'True until the first account (the admin) exists' }),
    defaultLanguage: Language,
    googleCalendar: z.boolean().openapi({ description: 'Whether Google Calendar accounts can be connected' }),
    microsoftCalendar: z
      .boolean()
      .openapi({ description: 'Whether Microsoft accounts (Outlook.com, Microsoft 365) can be connected' }),
    passwordReset: z
      .boolean()
      .openapi({ description: 'Whether this server can email password reset links (it has email set up)' }),
  })
  .openapi('PublicInstance');

export const InstanceSettings = z
  .object({
    name: Name,
    signUps: z.enum(SIGN_UPS).openapi({ description: 'Closed: only existing accounts can sign in' }),
    defaultLanguage: Language,
    defaultHomeTz: z
      .string()
      .refine(isTimeZone, 'an IANA time zone like Europe/London')
      .nullable()
      .openapi({ example: 'Asia/Tehran', description: "New accounts' home zone; null uses each browser's" }),
    defaultSecondaryCalendar: z
      .enum(SECONDARY_CALENDARS)
      .openapi({ description: 'The second calendar new accounts start with' }),
  })
  .openapi('InstanceSettings');

export const InstanceSettingsPatch = InstanceSettings.partial().openapi('InstanceSettingsPatch');
