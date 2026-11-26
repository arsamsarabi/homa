// A user's circles: named groups of other people on the instance, private to their owner.
import { NotFoundError, ValidationError } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';
import { PEOPLE_LIMITS } from './schemas';

/** Default palette for new circles (matches the web calendar swatches). */
const DEFAULT_COLORS = [
  '#7d7fa3',
  '#8f818d',
  '#a6807a',
  '#c06c84',
  '#c2575b',
  '#c4704f',
  '#a87d24',
  '#7f8f34',
  '#669070',
  '#3b9492',
  '#4f8fc0',
  '#6c7fd1',
  '#9070c8',
  '#a8649e',
] as const;

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;

/** Random seed for a generated identicon; clients may send their own instead. */
export const newAvatarSeed = (): string => crypto.randomUUID().replaceAll('-', '').slice(0, 16);

export const newCircleColor = (): string => pick(DEFAULT_COLORS);

export type CircleCreateInput = {
  name: string;
  color?: string;
  avatarSeed?: string;
  avatarImage?: string | null;
  memberIds?: string[];
};

export type CirclePatchInput = {
  name?: string;
  color?: string;
  avatarSeed?: string;
  avatarImage?: string | null;
};

export const listPeople = (db: Db, userId: string): Promise<repo.Person[]> => repo.listPeople(db, userId);

export const listCircles = (db: Db, userId: string): Promise<repo.CircleWithMembers[]> => repo.listCircles(db, userId);

/** Checks the members are other people on the instance; returns them without duplicates. */
async function checkMembers(tx: Executor, userId: string, memberIds: readonly string[]): Promise<string[]> {
  const ids = [...new Set(memberIds)];
  if (ids.includes(userId)) throw new ValidationError("You can't be in your own circle");
  const found = await repo.existingUserIds(tx, ids);
  if (ids.some((id) => !found.has(id))) throw new ValidationError('Unknown person');
  return ids;
}

async function ownCircle(tx: Executor, userId: string, id: string): Promise<repo.CircleWithMembers> {
  const c = await repo.findOwnedCircle(tx, userId, id);
  if (!c) throw new NotFoundError();
  return c;
}

export function createCircle(db: Db, userId: string, input: CircleCreateInput): Promise<repo.CircleWithMembers> {
  return db.transaction(async (tx) => {
    if ((await repo.countCircles(tx, userId)) >= PEOPLE_LIMITS.circlesPerUser)
      throw new ValidationError(`You can have at most ${PEOPLE_LIMITS.circlesPerUser} circles`);
    if (await repo.circleNameTaken(tx, userId, input.name))
      throw new ValidationError(`You already have a circle called "${input.name}"`);
    const members = await checkMembers(tx, userId, input.memberIds ?? []);
    const row = await repo.insertCircle(tx, userId, {
      name: input.name,
      color: input.color ?? newCircleColor(),
      avatarSeed: input.avatarSeed ?? newAvatarSeed(),
      avatarImage: input.avatarImage ?? null,
    });
    await repo.replaceCircleMembers(tx, row.id, members);
    return ownCircle(tx, userId, row.id);
  });
}

export function updateCircle(
  db: Db,
  userId: string,
  id: string,
  patch: CirclePatchInput,
): Promise<repo.CircleWithMembers> {
  return db.transaction(async (tx) => {
    await ownCircle(tx, userId, id);
    if (patch.name !== undefined && (await repo.circleNameTaken(tx, userId, patch.name, id)))
      throw new ValidationError(`You already have a circle called "${patch.name}"`);
    const columns: Partial<repo.CircleValues> = {};
    if (patch.name !== undefined) columns.name = patch.name;
    if (patch.color !== undefined) columns.color = patch.color;
    if (patch.avatarSeed !== undefined) columns.avatarSeed = patch.avatarSeed;
    if (patch.avatarImage !== undefined) columns.avatarImage = patch.avatarImage;
    if (Object.keys(columns).length && !(await repo.updateOwnedCircle(tx, userId, id, columns)))
      throw new NotFoundError();
    return ownCircle(tx, userId, id);
  });
}

export function setCircleMembers(
  db: Db,
  userId: string,
  id: string,
  memberIds: readonly string[],
): Promise<repo.CircleWithMembers> {
  return db.transaction(async (tx) => {
    await ownCircle(tx, userId, id);
    await repo.replaceCircleMembers(tx, id, await checkMembers(tx, userId, memberIds));
    return ownCircle(tx, userId, id);
  });
}

/** Deletes a circle; its members and the grants made to it go with it. */
export async function deleteCircle(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.deleteOwnedCircle(db, userId, id))) throw new NotFoundError();
}
