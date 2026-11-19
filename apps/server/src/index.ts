import { createDb, runMigrations } from '@homa/db';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadConfig } from './config';
import { startWorker } from './jobs';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const role = config.HOMA_ROLE;

// Only the API applies migrations, so a separate worker never races it.
if (role !== 'worker') await runMigrations(db);

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

const boss = role === 'api' ? undefined : await startWorker(config.DATABASE_URL, db);

console.log(`homa ${role}${server ? ` listening on http://localhost:${server.port}` : ''}`);

async function shutdown() {
  await server?.stop();
  await boss?.stop({ graceful: true, timeout: 20_000 });
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
