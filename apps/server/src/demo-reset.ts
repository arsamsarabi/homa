// Resets a demo instance: drops every account and its data, then seeds the demo again. The nightly
// job runs it in the API's container: `bun apps/server/src/demo-reset.ts`.
import { createDb } from '@homa/db';
import { loadConfig } from './config';
import { resetDemo } from './demo';
import { log } from './log';

const config = loadConfig();
if (!config.HOMA_DEMO) {
  log.error('not resetting: this wipes every account, and HOMA_DEMO is not true here');
  process.exit(1);
}
const { db, pool } = createDb(config.DATABASE_URL);
await resetDemo(db, { secret: config.BETTER_AUTH_SECRET, baseURL: config.HOMA_URL });
log.info('demo reset');
await pool.end();
