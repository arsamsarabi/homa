import { parseCredentialKey } from '@homa/sync';
import { z } from 'zod';

const isKey = (v: string): boolean => {
  try {
    parseCredentialKey(v);
    return true;
  } catch {
    return false; // reported by the refine below
  }
};

const Env = z
  .object({
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters (try: openssl rand -base64 32)'),
    HOMA_URL: z.string().url().default('http://localhost:3000'),
    PORT: z.coerce.number().int().positive().default(3000),
    HOMA_ROLE: z.enum(['api', 'worker', 'all']).default('all'),
    // The built web app to serve, relative to the working directory. Unset in development (Vite serves it).
    HOMA_WEB_DIR: z.string().optional(),
    // Pins the first-run setup code instead of a random one. For automated tests; leave unset otherwise.
    HOMA_SETUP_CODE: z
      .string()
      .regex(/^\d{4}$/, 'HOMA_SETUP_CODE must be 4 digits')
      .optional(),
    // Encrypts connected calendars' credentials (feed URLs, later OAuth tokens) at rest. Optional until
    // someone adds a connected calendar; a server with connections refuses to start without it.
    // Empty counts as unset: compose passes `${HOMA_ENCRYPTION_KEY:-}` through.
    HOMA_ENCRYPTION_KEY: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z
        .string()
        .refine(isKey, 'HOMA_ENCRYPTION_KEY must be 32 bytes, base64-encoded (try: openssl rand -base64 32)')
        .optional(),
    ),
    // The instance's Google OAuth client, for Google Calendar connections. Both or neither; without
    // them Google isn't offered. Its redirect URI is ${HOMA_URL}/api/connections/google/callback.
    HOMA_GOOGLE_CLIENT_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    HOMA_GOOGLE_CLIENT_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    // The instance's Microsoft Entra ID app, for Outlook.com and Microsoft 365 calendars. Both or
    // neither; its redirect URI is ${HOMA_URL}/api/connections/microsoft/callback.
    HOMA_MICROSOFT_CLIENT_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    HOMA_MICROSOFT_CLIENT_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    // How often each connected calendar is synced, in minutes.
    HOMA_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
    // Lets feeds on loopback and private networks be subscribed to (refused by default: SSRF).
    HOMA_SYNC_ALLOW_PRIVATE_NETWORKS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    // Web push (VAPID) keys, base64url as `bunx web-push generate-vapid-keys` prints them. Both or
    // neither; without them the first start generates a pair and stores it in the database.
    HOMA_VAPID_PUBLIC_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    HOMA_VAPID_PRIVATE_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    // Who push services can contact about this instance: a mailto: or https: URL. Defaults to
    // HOMA_URL when that is HTTPS (Apple refuses localhost subjects).
    HOMA_VAPID_SUBJECT: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z
        .string()
        .regex(/^(mailto:|https:\/\/)/, 'HOMA_VAPID_SUBJECT must be a mailto: or https:// URL')
        .optional(),
    ),
    // Lets notifications go to loopback and private networks, and over plain http: web push
    // endpoints in tests, and ntfy, Gotify and webhooks on the self-hoster's own network. Refused by
    // default: SSRF.
    HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    // The SMTP server email reminders go through: smtp://user:pass@host:587 (STARTTLS) or
    // smtps://user:pass@host:465. With HOMA_MAIL_FROM; both or neither. Without them there is no email.
    HOMA_SMTP_URL: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z
        .string()
        .regex(/^smtps?:\/\//, 'HOMA_SMTP_URL must start with smtp:// or smtps://')
        .optional(),
    ),
    // The sender, such as `Homa <homa@example.com>`.
    HOMA_MAIL_FROM: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    // Whether new accounts must confirm their email address before they can sign in. Defaults to
    // true when email is set up (HOMA_SMTP_URL), false otherwise; true needs email.
    HOMA_REQUIRE_EMAIL_VERIFICATION: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === 'true')),
    ),
    // Better Auth's per-IP limits on sign-in and sign-up. Turn off only for automated tests, where
    // one machine signs up several accounts within seconds.
    HOMA_AUTH_RATE_LIMIT: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    // A public demo: everyone shares one seeded account, and nothing leaves the server (no email,
    // channels, push or connected calendars). Wipes nothing by itself; see docs/self-hosting/demo.md.
    HOMA_DEMO: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    // One OIDC provider for sign-in (Better Auth genericOAuth, provider id `oidc`). All three of
    // issuer, client id and secret, or none. The button label defaults to "SSO".
    HOMA_OIDC_ISSUER: z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()),
    HOMA_OIDC_CLIENT_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    HOMA_OIDC_CLIENT_SECRET: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    HOMA_OIDC_NAME: z.preprocess((v) => (v === '' ? undefined : v), z.string().default('SSO')),
  })
  .refine((env) => !env.HOMA_GOOGLE_CLIENT_ID === !env.HOMA_GOOGLE_CLIENT_SECRET, {
    message: 'set both HOMA_GOOGLE_CLIENT_ID and HOMA_GOOGLE_CLIENT_SECRET, or neither',
    path: ['HOMA_GOOGLE_CLIENT_SECRET'],
  })
  .refine((env) => !env.HOMA_MICROSOFT_CLIENT_ID === !env.HOMA_MICROSOFT_CLIENT_SECRET, {
    message: 'set both HOMA_MICROSOFT_CLIENT_ID and HOMA_MICROSOFT_CLIENT_SECRET, or neither',
    path: ['HOMA_MICROSOFT_CLIENT_SECRET'],
  })
  .refine((env) => !env.HOMA_SMTP_URL === !env.HOMA_MAIL_FROM, {
    message: 'set both HOMA_SMTP_URL and HOMA_MAIL_FROM, or neither',
    path: ['HOMA_MAIL_FROM'],
  })
  .refine((env) => !env.HOMA_VAPID_PUBLIC_KEY === !env.HOMA_VAPID_PRIVATE_KEY, {
    message: 'set both HOMA_VAPID_PUBLIC_KEY and HOMA_VAPID_PRIVATE_KEY, or neither',
    path: ['HOMA_VAPID_PRIVATE_KEY'],
  })
  .refine((env) => !(env.HOMA_REQUIRE_EMAIL_VERIFICATION && !env.HOMA_SMTP_URL), {
    message:
      'HOMA_REQUIRE_EMAIL_VERIFICATION=true needs email: set HOMA_SMTP_URL and HOMA_MAIL_FROM, or leave it unset',
    path: ['HOMA_REQUIRE_EMAIL_VERIFICATION'],
  })
  .refine(
    (env) => {
      const n = [env.HOMA_OIDC_ISSUER, env.HOMA_OIDC_CLIENT_ID, env.HOMA_OIDC_CLIENT_SECRET].filter(Boolean).length;
      return n === 0 || n === 3;
    },
    {
      message: 'set HOMA_OIDC_ISSUER, HOMA_OIDC_CLIENT_ID and HOMA_OIDC_CLIENT_SECRET all together, or none',
      path: ['HOMA_OIDC_CLIENT_SECRET'],
    },
  )
  .refine(
    (env) =>
      !(
        env.HOMA_DEMO &&
        (env.HOMA_SMTP_URL || env.HOMA_GOOGLE_CLIENT_ID || env.HOMA_MICROSOFT_CLIENT_ID || env.HOMA_OIDC_ISSUER)
      ),
    {
      message:
        'HOMA_DEMO=true sends nothing out: leave HOMA_SMTP_URL, HOMA_GOOGLE_*, HOMA_MICROSOFT_* and HOMA_OIDC_* unset',
      path: ['HOMA_DEMO'],
    },
  )
  .transform((env) => ({
    ...env,
    HOMA_REQUIRE_EMAIL_VERIFICATION: env.HOMA_REQUIRE_EMAIL_VERIFICATION ?? Boolean(env.HOMA_SMTP_URL),
  }));

export type Config = z.infer<typeof Env>;

/** The one OIDC provider, when configured; null when all three secrets are unset. */
export type OidcSettings = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  name: string;
  /** Register this URI with the identity provider. */
  redirectUri: string;
};

/** Passkey relying-party settings derived from HOMA_URL and the instance name. */
export type PasskeySettings = { rpID: string; rpName: string; origin: string };

const trimTrailingSlash = (url: string): string => url.replace(/\/$/, '');

/** Reads OIDC from a validated config, or null when it isn't set up. */
export function oidcFrom(config: Config): OidcSettings | null {
  if (!config.HOMA_OIDC_ISSUER || !config.HOMA_OIDC_CLIENT_ID || !config.HOMA_OIDC_CLIENT_SECRET) return null;
  const base = trimTrailingSlash(config.HOMA_URL);
  return {
    issuer: config.HOMA_OIDC_ISSUER,
    clientId: config.HOMA_OIDC_CLIENT_ID,
    clientSecret: config.HOMA_OIDC_CLIENT_SECRET,
    name: config.HOMA_OIDC_NAME,
    redirectUri: `${base}/api/auth/callback/oidc`,
  };
}

/** Passkey rpID/origin from HOMA_URL; rpName is the instance's display name. */
export function passkeyFrom(config: Config, instanceName: string): PasskeySettings {
  const origin = trimTrailingSlash(config.HOMA_URL);
  return { rpID: new URL(origin).hostname, rpName: instanceName, origin };
}

/** Reads and validates the environment. Throws one error listing every problem. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  return parsed.data;
}
