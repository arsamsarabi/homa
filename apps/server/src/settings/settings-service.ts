// A user's settings.
import { NotFoundError } from '@homa/core';
import { type Db, repo } from '@homa/db';

export async function getSettings(db: Db, userId: string): Promise<repo.SettingsRow> {
  const row = await repo.findSettings(db, userId);
  if (!row) throw new NotFoundError();
  return row;
}

/** Applies a partial change; an empty one changes nothing and returns the settings. */
export async function updateSettings(
  db: Db,
  userId: string,
  patch: Partial<repo.SettingsRow>,
): Promise<repo.SettingsRow> {
  if (Object.keys(patch).length === 0) return getSettings(db, userId);
  const row = await repo.updateSettings(db, userId, patch);
  if (!row) throw new NotFoundError();
  return row;
}
