// Scheduled jobs on pg-boss. Each handler calls a service and logs counts.
import type { Db } from '@homa/db';
import { PgBoss } from 'pg-boss';
import { purgeExpiredAuth } from '../auth';
import { extendHorizon } from '../calendar';
import { errorFields, log } from '../log';

export const PURGE_AUTH = 'maintenance.purge-auth';
export const EXTEND_HORIZON = 'calendar.extend-horizon';

const SCHEDULES: { name: string; cron: string; run: (db: Db) => Promise<unknown> }[] = [
  { name: PURGE_AUTH, cron: '17 3 * * *', run: purgeExpiredAuth }, // daily, 03:17 UTC
  {
    name: EXTEND_HORIZON,
    cron: '41 2 * * *',
    run: async (db: Db): Promise<{ events: number }> => ({ events: await extendHorizon(db) }),
  }, // daily, 02:41 UTC
];

export async function startWorker(databaseUrl: string, db: Db): Promise<PgBoss> {
  const boss = new PgBoss(databaseUrl);
  boss.on('error', (err) => log.error('pg-boss error', errorFields(err)));
  await boss.start();
  for (const job of SCHEDULES) {
    await boss.createQueue(job.name);
    await boss.schedule(job.name, job.cron);
    await boss.work(job.name, async () => {
      log.info('job done', { job: job.name, result: await job.run(db) });
    });
  }
  return boss;
}
