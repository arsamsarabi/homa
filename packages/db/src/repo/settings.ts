// A user's own settings, stored on their users row.
import { eq } from 'drizzle-orm';
import type { Executor } from '../client';
import { users } from '../schema';

export type SettingsRow = {
  homeTz: string | null;
  secondaryCalendar: string;
  weekStart: number | null;
  defaultReminderMinutes: number | null;
};

// biome-ignore lint/nursery/useExplicitType: Drizzle infers the selected row type from these columns.
const columns = {
  homeTz: users.homeTz,
  secondaryCalendar: users.secondaryCalendar,
  weekStart: users.weekStart,
  defaultReminderMinutes: users.defaultReminderMinutes,
};

/** The user's settings, or undefined if there is no such user. */
export async function findSettings(db: Executor, userId: string): Promise<SettingsRow | undefined> {
  const [row] = await db.select(columns).from(users).where(eq(users.id, userId));
  return row;
}

/** Returns the updated settings, or undefined if there is no such user. */
export async function updateSettings(
  db: Executor,
  userId: string,
  values: Partial<SettingsRow>,
): Promise<SettingsRow | undefined> {
  const [row] = await db.update(users).set(values).where(eq(users.id, userId)).returning(columns);
  return row;
}
