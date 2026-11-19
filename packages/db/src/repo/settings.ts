// A user's own settings, stored on their users row.
import { eq } from 'drizzle-orm';
import type { Executor } from '../client';
import { users } from '../schema';

export type SettingsRow = { homeTz: string | null; secondaryCalendar: string };

/** The user's settings, or undefined if there is no such user. */
export async function findSettings(db: Executor, userId: string): Promise<SettingsRow | undefined> {
  const [row] = await db
    .select({ homeTz: users.homeTz, secondaryCalendar: users.secondaryCalendar })
    .from(users)
    .where(eq(users.id, userId));
  return row;
}

/** Returns the updated settings, or undefined if there is no such user. */
export async function updateSettings(
  db: Executor,
  userId: string,
  values: Partial<SettingsRow>,
): Promise<SettingsRow | undefined> {
  const [row] = await db
    .update(users)
    .set(values)
    .where(eq(users.id, userId))
    .returning({ homeTz: users.homeTz, secondaryCalendar: users.secondaryCalendar });
  return row;
}
