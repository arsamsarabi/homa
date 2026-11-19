// Entry point. HOMA_ROLE picks what this process runs: the API, the job worker, or both.
import { createDb, runMigrations } from '@homa/db';
import type { PgBoss } from 'pg-boss';
import { createAuth } from './auth';
import { type Config, loadConfig } from './config';
import { createApp } from './http';
import { startWorker } from './jobs';
import { log } from './log';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const role: Config['HOMA_ROLE'] = config.HOMA_ROLE;

// Only the API applies migrations, so a separate worker never races it.
if (role !== 'worker') {
  await runMigrations(db);
  log.info('migrations applied');
}

const server =
  role === 'worker'
    ? undefined
    : Bun.serve({
        port: config.PORT,
        fetch: createApp(
          { db, auth: createAuth(db, { secret: config.BETTER_AUTH_SECRET, baseURL: config.HOMA_URL }) },
          config.HOMA_WEB_DIR,
        ).fetch,
      });

const boss: PgBoss | undefined = role === 'api' ? undefined : await startWorker(config.DATABASE_URL, db);

log.info('homa started', { role, ...(server && { url: `http://localhost:${server.port}` }) });

async function shutdown(): Promise<void> {
  await server?.stop();
  await boss?.stop({ graceful: true, timeout: 20_000 });
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
