import { type Db, schema } from '@homa/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { count } from 'drizzle-orm';

export function createAuth(db: Db, opts: { secret: string; baseURL: string }) {
  return betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    basePath: '/api/auth',
    database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true }),
    emailAndPassword: { enabled: true },
    plugins: [admin()],
    databaseHooks: {
      user: {
        create: {
          // The first account on an instance becomes its admin.
          // shortcut: two sign-ups racing on an empty instance could both become admin; add an
          // advisory lock if that ever matters (onboarding makes the first sign-up deliberate).
          before: async (user) => {
            const [row] = await db.select({ n: count() }).from(schema.users);
            return { data: { ...user, role: row?.n === 0 ? 'admin' : 'user' } };
          },
          // Everyone starts with one calendar to put events in.
          after: async (user) => {
            await db.insert(schema.calendars).values({ ownerUserId: user.id, name: 'Personal' });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
