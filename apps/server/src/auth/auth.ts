// Better Auth: email and password accounts, sessions in Postgres. The first account on an
// instance becomes its admin, and every account starts with a "Personal" calendar.
import { type Db, repo, schema } from '@homa/db';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { createCalendar } from '../calendar/calendars-service';

type AuthOptions = { secret: string; baseURL: string };

// biome-ignore lint/nursery/useExplicitType: the inferred options type carries the plugin types that Auth is built from.
function authConfig(db: Db, opts: AuthOptions) {
  return {
    secret: opts.secret,
    baseURL: opts.baseURL,
    basePath: '/api/auth',
    database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true }),
    emailAndPassword: { enabled: true },
    plugins: [admin()],
    databaseHooks: {
      user: {
        create: {
          // shortcut: two sign-ups racing on an empty instance could both become admin; add an
          // advisory lock if that ever matters (onboarding makes the first sign-up deliberate).
          before: async <U extends object>(user: U): Promise<{ data: U & { role: string } }> => ({
            data: { ...user, role: (await repo.countUsers(db)) === 0 ? 'admin' : 'user' },
          }),
          after: async (user: { id: string }): Promise<void> => {
            await createCalendar(db, user.id, { name: 'Personal' });
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}

export type Auth = ReturnType<typeof betterAuth<ReturnType<typeof authConfig>>>;

export const createAuth = (db: Db, opts: AuthOptions): Auth => betterAuth(authConfig(db, opts));
