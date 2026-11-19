// Scheduled jobs on pg-boss. Each handler calls a service and logs counts.
import type { Db } from '@homa/db';
import { PgBoss } from 'pg-boss';
import { purgeExpiredAuth } from '@/auth';
import { extendHorizon } from '@/calendar';
import { type SyncSettings, syncDueConnections } from '@/connections';
import { errorFields, log } from '@/log';

export const PURGE_AUTH = 'maintenance.purge-auth';
export const EXTEND_HORIZON = 'calendar.extend-horizon';
export const SYNC_CONNECTIONS = 'sync.connections';

type Schedule = { name: string; cron: string; run: (db: Db) => Promise<unknown> };

const schedules = (sync: SyncSettings): Schedule[] => [
  { name: PURGE_AUTH, cron: '17 3 * * *', run: purgeExpiredAuth }, // daily, 03:17 UTC
  {
    name: EXTEND_HORIZON,
    cron: '41 2 * * *',
    run: async (db: Db): Promise<{ events: number }> => ({ events: await extendHorizon(db) }),
  }, // daily, 02:41 UTC
  // Every 5 minutes, syncs the connections last tried more than HOMA_SYNC_INTERVAL_MINUTES ago.
  { name: SYNC_CONNECTIONS, cron: '*/5 * * * *', run: (db: Db): Promise<unknown> => syncDueConnections(db, sync) },
];

export async function startWorker(databaseUrl: string, db: Db, sync: SyncSettings): Promise<PgBoss> {
  const boss = new PgBoss(databaseUrl);
  boss.on('error', (err) => log.error('pg-boss error', errorFields(err)));
  await boss.start();
  for (const job of schedules(sync)) {
    await boss.createQueue(job.name);
    await boss.schedule(job.name, job.cron);
    await boss.work(job.name, async () => {
      log.info('job done', { job: job.name, result: await job.run(db) });
    });
  }
  return boss;
}
