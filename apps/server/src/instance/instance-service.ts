// The instance's settings: what the admin chooses, what everyone can see, and what new accounts get.
import { type Db, repo } from '@homa/db';

export type InstanceSettings = {
  name: string;
  signUps: string;
  defaultLanguage: string;
  defaultHomeTz: string | null;
  defaultSecondaryCalendar: string;
};

export type PublicInstance = {
  name: string;
  signUpsOpen: boolean;
  needsSetup: boolean;
  defaultLanguage: string;
  googleCalendar: boolean;
  microsoftCalendar: boolean;
};

const fromRow = ({ instanceName, ...rest }: repo.InstanceSettingsRow): InstanceSettings => ({
  name: instanceName,
  ...rest,
});

export const getInstanceSettings = async (db: Db): Promise<InstanceSettings> =>
  fromRow(await repo.findInstanceSettings(db));

/** Applies a partial change; an empty one changes nothing. */
export async function updateInstanceSettings(db: Db, patch: Partial<InstanceSettings>): Promise<InstanceSettings> {
  if (Object.keys(patch).length === 0) return getInstanceSettings(db);
  const { name, ...rest } = patch;
  return fromRow(
    await repo.updateInstanceSettings(db, { ...rest, ...(name === undefined ? {} : { instanceName: name }) }),
  );
}

/** Which OAuth providers the server is set up for. */
export async function getPublicInstance(
  db: Db,
  { googleCalendar = false, microsoftCalendar = false } = {},
): Promise<PublicInstance> {
  const [s, users] = await Promise.all([getInstanceSettings(db), repo.countUsers(db)]);
  const needsSetup = users === 0;
  return {
    name: s.name,
    signUpsOpen: needsSetup || s.signUps === 'open',
    needsSetup,
    defaultLanguage: s.defaultLanguage,
    googleCalendar,
    microsoftCalendar,
  };
}

/**
 * Who a new account becomes: the first is the admin, later ones are users. Returns undefined when
 * a self sign-up has to be turned away because the admin closed sign-ups.
 */
export async function admitNewUser(db: Db, selfSignUp: boolean): Promise<'admin' | 'user' | undefined> {
  if ((await repo.countUsers(db)) === 0) return 'admin';
  if (selfSignUp && (await repo.findInstanceSettings(db)).signUps === 'closed') return undefined;
  return 'user';
}

/** Gives a new account the instance's default home zone and second calendar. */
export async function applyNewUserDefaults(db: Db, userId: string): Promise<void> {
  const s = await repo.findInstanceSettings(db);
  await repo.updateSettings(db, userId, { homeTz: s.defaultHomeTz, secondaryCalendar: s.defaultSecondaryCalendar });
}
