// Sets an account's password from the command line, for a server without email (so no reset links):
//   docker compose exec api bun apps/server/src/auth/set-password.ts ada@example.com
// It asks for the new password, saves it the way Better Auth does, and signs the account out
// everywhere. Reads the same environment as the server (DATABASE_URL, BETTER_AUTH_SECRET).
import { createDb } from '@homa/db';
import { loadConfig } from '@/config';
import { createAuth } from './auth';

const MIN_LENGTH = 8;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email) fail('Usage: bun apps/server/src/auth/set-password.ts <email>');

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
// The setup gate never runs here: no account is created.
const auth = createAuth(db, {
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.HOMA_URL,
  setupGate: { current: () => '', check: () => false },
});

try {
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(email, { includeAccounts: true });
  if (!found) fail(`No account uses ${email}.`);
  if (!found.accounts.some((a) => a.providerId === 'credential')) fail(`${email} has no password to change.`);
  // The password shows as it's typed; clear the terminal afterwards if others can see it.
  const password = prompt(`New password for ${email} (at least ${MIN_LENGTH} characters):`)?.trim() ?? '';
  if (password.length < MIN_LENGTH) fail(`The password needs at least ${MIN_LENGTH} characters. Nothing changed.`);
  await ctx.internalAdapter.updatePassword(found.user.id, await ctx.password.hash(password));
  await ctx.internalAdapter.deleteUserSessions(found.user.id);
  process.stdout.write(`Password changed for ${email}, and it's signed out everywhere.\n`);
} finally {
  await pool.end();
}
