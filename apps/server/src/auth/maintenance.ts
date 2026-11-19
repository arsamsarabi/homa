// Housekeeping for the auth tables, run nightly by the worker.
import { type Db, repo } from '@homa/db';

/** Deletes expired sessions and verification tokens. Returns how many rows went. */
export const purgeExpiredAuth = (db: Db, now = new Date()): Promise<{ sessions: number; verifications: number }> =>
  repo.deleteExpiredAuth(db, now);
