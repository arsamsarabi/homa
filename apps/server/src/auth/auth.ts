// Better Auth: email and password accounts, sessions in Postgres. The first account on an
// instance becomes its admin, every account starts with a "Personal" calendar and the instance's
// default settings, and closed sign-ups turn new people away.
import { type Db, schema } from '@homa/db';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { admin } from 'better-auth/plugins';
import { createCalendar } from '@/calendar/calendars-service';
import { admitNewUser, applyNewUserDefaults } from '@/instance/instance-service';
import { SETUP_CODE_HEADER, type SetupGate } from '@/instance/setup-code';

export const SIGN_UPS_CLOSED = 'Sign-ups are closed on this Homa. Ask its admin for an account.';
export const WRONG_SETUP_CODE = "That setup code isn't right. Find the current one in the server log.";

type AuthOptions = {
  secret: string;
  baseURL: string;
  /** Guards the first sign-up (the admin) with the code from the server log. */
  setupGate: SetupGate;
};

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
          // advisory lock if that ever matters (the setup journey makes the first sign-up deliberate).
          before: async <U extends object>(
            user: U,
            ctx: { path: string; headers?: Headers } | null,
          ): Promise<{ data: U & { role: string } }> => {
            // Closed sign-ups turn away people signing themselves up, not accounts an admin creates.
            const role = await admitNewUser(db, ctx !== null && ctx.path !== '/admin/create-user');
            if (!role) throw new APIError('FORBIDDEN', { message: SIGN_UPS_CLOSED });
            if (role === 'admin' && !opts.setupGate.check(ctx?.headers?.get(SETUP_CODE_HEADER))) {
              throw new APIError('FORBIDDEN', { message: WRONG_SETUP_CODE });
            }
            return { data: { ...user, role } };
          },
          after: async (user: { id: string }): Promise<void> => {
            await applyNewUserDefaults(db, user.id);
            await createCalendar(db, user.id, { name: 'Personal' });
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}

export type Auth = ReturnType<typeof betterAuth<ReturnType<typeof authConfig>>>;

export const createAuth = (db: Db, opts: AuthOptions): Auth => betterAuth(authConfig(db, opts));
