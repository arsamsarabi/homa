// The instance, as the API returns it: its public face and the admin's settings.
import { z } from 'zod';
import { SECONDARY_CALENDARS } from '@/schemas/settings';

export const SIGN_UPS = ['open', 'closed'] as const;
export type SignUps = (typeof SIGN_UPS)[number];
export const LANGUAGES = ['en', 'fa'] as const;
export const WHO_CAN_INVITE = ['admins', 'everyone'] as const;
export type WhoCanInvite = (typeof WHO_CAN_INVITE)[number];

export const PublicInstanceSchema = z.object({
  name: z.string(),
  signUpsOpen: z.boolean(),
  /** True until the first account (the admin) exists. */
  needsSetup: z.boolean(),
  defaultLanguage: z.enum(LANGUAGES),
  /** Whether Google Calendar accounts can be connected on this server. */
  googleCalendar: z.boolean(),
  /** Whether Microsoft accounts (Outlook.com, Microsoft 365) can be connected on this server. */
  microsoftCalendar: z.boolean(),
  /** Whether this server can email password reset links (it has email set up). */
  passwordReset: z.boolean(),
  /** Whether everyone, not only admins, can create invite links. */
  anyoneCanInvite: z.boolean(),
  /** A demo instance's shared sign-in; null on every other instance. */
  demo: z.object({ email: z.string(), password: z.string() }).nullable(),
});
export type PublicInstance = z.infer<typeof PublicInstanceSchema>;

export const InstanceSettingsSchema = z.object({
  name: z.string(),
  signUps: z.enum(SIGN_UPS),
  invites: z.enum(WHO_CAN_INVITE),
  defaultLanguage: z.enum(LANGUAGES),
  /** null: each person's browser zone. */
  defaultHomeTz: z.string().nullable(),
  defaultSecondaryCalendar: z.enum(SECONDARY_CALENDARS),
});
export type InstanceSettings = z.infer<typeof InstanceSettingsSchema>;
