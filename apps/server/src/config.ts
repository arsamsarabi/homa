import { z } from 'zod';

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
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  return parsed.data;
}
