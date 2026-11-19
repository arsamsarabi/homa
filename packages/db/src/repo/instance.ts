// The instance's settings: a single row, seeded by its migration.
import type { Executor } from '../client';
import { instanceSettings } from '../schema';

export type InstanceSettingsRow = {
  instanceName: string;
  signUps: string;
  defaultLanguage: string;
  defaultHomeTz: string | null;
  defaultSecondaryCalendar: string;
};

// biome-ignore lint/nursery/useExplicitType: Drizzle infers the selected row type from these columns.
const columns = {
  instanceName: instanceSettings.instanceName,
  signUps: instanceSettings.signUps,
  defaultLanguage: instanceSettings.defaultLanguage,
  defaultHomeTz: instanceSettings.defaultHomeTz,
  defaultSecondaryCalendar: instanceSettings.defaultSecondaryCalendar,
};

const missing = (): Error => new Error('instance_settings has no row; are the migrations applied?');

export async function findInstanceSettings(db: Executor): Promise<InstanceSettingsRow> {
  const [row] = await db.select(columns).from(instanceSettings).limit(1);
  if (!row) throw missing();
  return row;
}

/** Changes the given settings and returns them all. */
export async function updateInstanceSettings(
  db: Executor,
  values: Partial<InstanceSettingsRow>,
): Promise<InstanceSettingsRow> {
  const [row] = await db.update(instanceSettings).set(values).returning(columns);
  if (!row) throw missing();
  return row;
}
