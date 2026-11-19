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

const Env = z.object({
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
  // How often each connected calendar is synced, in minutes.
  HOMA_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  // Lets feeds on loopback and private networks be subscribed to (refused by default: SSRF).
  HOMA_SYNC_ALLOW_PRIVATE_NETWORKS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Better Auth's per-IP limits on sign-in and sign-up. Turn off only for automated tests, where
  // one machine signs up several accounts within seconds.
  HOMA_AUTH_RATE_LIMIT: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof Env>;

/** Reads and validates the environment. Throws one error listing every problem. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  return parsed.data;
}
