import type { Db } from '@homa/db';
import { type Auth, createAuth } from '@/auth';
import type { SetupGate } from '@/instance';

/** A setup gate that lets every first sign-up through, for tests that aren't about the gate. */
export const OPEN_SETUP_GATE: SetupGate = { current: () => '0000', check: () => true };

/** Better Auth for tests: a fixed secret, localhost, and (unless given) an open setup gate. */
export const testAuth = (db: Db, setupGate: SetupGate = OPEN_SETUP_GATE): Auth =>
  createAuth(db, { secret: 'x'.repeat(32), baseURL: 'http://localhost:3000', setupGate });
