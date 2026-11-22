// Entry point. HOMA_ROLE picks what this process runs: the API, the job worker, or both.
import { createDb, repo, runMigrations } from '@homa/db';
import type { PgBoss } from 'pg-boss';
import { createAuth } from './auth';
import { type Config, loadConfig } from './config';
import { syncSettingsFrom } from './connections';
import { createApp } from './http';
import { createSetupGate } from './instance';
import { startWorker } from './jobs';
import { log } from './log';
import { notifySettingsFrom, pushSettingsFrom } from './reminders';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const role: Config['HOMA_ROLE'] = config.HOMA_ROLE;
const sync = syncSettingsFrom(config);
const push = pushSettingsFrom(db, config);
const notify = notifySettingsFrom(config);

// Only the API applies migrations, so a separate worker never races it.
if (role !== 'worker') {
  await runMigrations(db);
  log.info('migrations applied');
}

// Until the first account exists, signing up needs this code; print it now so it's in the log.
const setupGate = createSetupGate({
  fixed: config.HOMA_SETUP_CODE,
  announce: (code: string): void =>
    log.warn(`first-run setup code: ${code} (enter it on the setup page to create the admin)`, { setupCode: code }),
});
if (role !== 'worker' && (await repo.countUsers(db)) === 0) setupGate.current();

// Connected calendars' credentials can't be read without the key they were encrypted with.
if (!sync.key && (await repo.countConnections(db)) > 0) {
  log.error(
    'HOMA_ENCRYPTION_KEY is not set, but this instance has connected calendars. Set it to the key they were added with.',
  );
  await pool.end();
  process.exit(1);
}

const server =
  role === 'worker'
    ? undefined
    : Bun.serve({
        port: config.PORT,
        fetch: createApp(
          {
            db,
            auth: createAuth(db, {
              secret: config.BETTER_AUTH_SECRET,
              baseURL: config.HOMA_URL,
              setupGate,
              rateLimit: config.HOMA_AUTH_RATE_LIMIT,
              sendMail: notify.sendMail,
              requireEmailVerification: config.HOMA_REQUIRE_EMAIL_VERIFICATION,
            }),
            sync,
            push,
            notify,
          },
          config.HOMA_WEB_DIR,
        ).fetch,
      });

const boss: PgBoss | undefined =
  role === 'api' ? undefined : await startWorker(config.DATABASE_URL, db, sync, push, notify);

log.info('homa started', { role, ...(server && { url: `http://localhost:${server.port}` }) });

async function shutdown(): Promise<void> {
  await server?.stop();
  await boss?.stop({ graceful: true, timeout: 20_000 });
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
