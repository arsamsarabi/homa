// Better Auth: email and password accounts, sessions in Postgres. The first account on an
// instance becomes its admin, every account starts with a "Personal" calendar and the instance's
// default settings, and closed sign-ups turn new people away.
//
// With email set up, Better Auth sends password reset links, and (when required) new accounts
// confirm their address before they can sign in. The admin's account is marked confirmed when it's
// made: the setup code already proves they run the server, and a mail server that isn't working
// yet mustn't lock them out of their own instance.
import { type Db, schema } from '@homa/db';
import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { admin } from 'better-auth/plugins';
import { createCalendar } from '@/calendar/calendars-service';
import { admitNewUser, applyNewUserDefaults, getInstanceSettings } from '@/instance/instance-service';
import { SETUP_CODE_HEADER, type SetupGate } from '@/instance/setup-code';
import { log } from '@/log';
import { claimInviteForSignUp, INVITE_HEADER, recordInviteUse } from '@/people/invites-service';
import type { Mail } from '@/reminders';
import { type AccountEmail, accountEmail, emailLanguage } from './emails';

export const SIGN_UPS_CLOSED = 'Sign-ups are closed on this Homa. Ask its admin for an account.';
export const WRONG_SETUP_CODE = "That setup code isn't right. Find the current one in the server log.";

type AuthOptions = {
  secret: string;
  baseURL: string;
  /** Guards the first sign-up (the admin) with the code from the server log. */
  setupGate: SetupGate;
  /** Better Auth's per-IP limits (on in production by default); false only for automated tests. */
  rateLimit?: boolean;
  /** Sends email (HOMA_SMTP_URL). Without it there are no password reset or confirmation emails. */
  sendMail?: (m: Mail) => Promise<void>;
  /** New accounts must confirm their address before signing in. Needs `sendMail`. */
  requireEmailVerification?: boolean;
};

/** Where the links in account emails land in the web app. */
export const VERIFY_EMAIL_PATH = '/verify-email';
export const RESET_PASSWORD_PATH = '/reset-password';

type EmailData = { user: { id: string; email: string; name: string; emailVerified: boolean }; url: string };

/** Better Auth's send callback for one kind of account email. */
function emailSender(
  db: Db,
  sendMail: (m: Mail) => Promise<void>,
  kind: AccountEmail,
): (data: EmailData, request?: Request) => Promise<void> {
  return async ({ user, url }: EmailData, request?: Request): Promise<void> => {
    // Better Auth asks on every sign-up; the admin is already confirmed and needs no link.
    if (kind === 'verify' && user.emailVerified) return;
    // The links land on the web app's pages whatever the client asked for.
    const link = new URL(url);
    link.searchParams.set('callbackURL', kind === 'verify' ? VERIFY_EMAIL_PATH : RESET_PASSWORD_PATH);
    const send = async (): Promise<void> => {
      const { defaultLanguage } = await getInstanceSettings(db);
      await sendMail(accountEmail(kind, emailLanguage(request, defaultLanguage), user, link.toString()));
    };
    // Not awaited: the reply must not take longer, or fail, only because the address has an account.
    send().catch((err: unknown) =>
      log.warn('account email failed', {
        kind,
        userId: user.id,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
  };
}

// biome-ignore lint/nursery/useExplicitType: the inferred options type carries the plugin types that Auth is built from.
function authConfig(db: Db, opts: AuthOptions) {
  return {
    secret: opts.secret,
    baseURL: opts.baseURL,
    basePath: '/api/auth',
    ...(opts.rateLimit === false && { rateLimit: { enabled: false } }),
    database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: Boolean(opts.requireEmailVerification && opts.sendMail),
      ...(opts.sendMail && { sendResetPassword: emailSender(db, opts.sendMail, 'reset') }),
      resetPasswordTokenExpiresIn: 60 * 60,
      // A reset is often because someone else may know the old password: sign out everywhere.
      revokeSessionsOnPasswordReset: true,
    },
    ...(opts.sendMail && {
      emailVerification: {
        sendVerificationEmail: emailSender(db, opts.sendMail, 'verify'),
        // Someone who lost the first email gets a new link when they try to sign in.
        sendOnSignIn: true,
        autoSignInAfterVerification: true,
        expiresIn: 60 * 60,
      },
    }),
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
            // Closed sign-ups turn away people signing themselves up, not accounts an admin creates
            // or people with an invite.
            const selfSignUp = ctx !== null && ctx.path !== '/admin/create-user';
            const inviteToken = selfSignUp ? ctx.headers?.get(INVITE_HEADER) : null;
            const role = await admitNewUser(db, selfSignUp && !inviteToken);
            // Not FORBIDDEN: with email confirmation on, Better Auth turns a 403 from here into its
            // "check your email" reply for an address that's taken, and the message would be lost.
            if (!role) throw new APIError('BAD_REQUEST', { message: SIGN_UPS_CLOSED });
            if (inviteToken && role === 'user') {
              const email = 'email' in user && typeof user.email === 'string' ? user.email : '';
              // Claimed before the account exists, so two sign-ups can't share one link.
              const claim = await claimInviteForSignUp(db, inviteToken, email).catch((err: unknown) => {
                throw new APIError('BAD_REQUEST', { message: err instanceof Error ? err.message : 'Invalid invite' });
              });
              // An invite emailed to this address proves it, so there's nothing left to confirm.
              if (claim.emailProven) return { data: { ...user, role, emailVerified: true } };
            }
            if (role === 'admin') {
              if (!opts.setupGate.check(ctx?.headers?.get(SETUP_CODE_HEADER))) {
                throw new APIError('BAD_REQUEST', { message: WRONG_SETUP_CODE });
              }
              return { data: { ...user, role, emailVerified: true } };
            }
            return { data: { ...user, role } };
          },
          after: async (user: { id: string }, ctx: { headers?: Headers } | null): Promise<void> => {
            const inviteToken = ctx?.headers?.get(INVITE_HEADER);
            if (inviteToken) await recordInviteUse(db, inviteToken, user.id);
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
