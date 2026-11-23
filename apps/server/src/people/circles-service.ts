// A user's circles: named groups of other people on the instance, private to their owner.
import { NotFoundError, ValidationError } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';
import { PEOPLE_LIMITS } from './schemas';

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

export function createCircle(
  db: Db,
  userId: string,
  input: { name: string; memberIds?: string[] },
): Promise<repo.CircleWithMembers> {
  return db.transaction(async (tx) => {
    if ((await repo.countCircles(tx, userId)) >= PEOPLE_LIMITS.circlesPerUser)
      throw new ValidationError(`You can have at most ${PEOPLE_LIMITS.circlesPerUser} circles`);
    if (await repo.circleNameTaken(tx, userId, input.name))
      throw new ValidationError(`You already have a circle called "${input.name}"`);
    const members = await checkMembers(tx, userId, input.memberIds ?? []);
    const row = await repo.insertCircle(tx, userId, input.name);
    await repo.replaceCircleMembers(tx, row.id, members);
    return ownCircle(tx, userId, row.id);
  });
}

export function renameCircle(db: Db, userId: string, id: string, name: string): Promise<repo.CircleWithMembers> {
  return db.transaction(async (tx) => {
    await ownCircle(tx, userId, id);
    if (await repo.circleNameTaken(tx, userId, name, id))
      throw new ValidationError(`You already have a circle called "${name}"`);
    await repo.renameOwnedCircle(tx, userId, id, name);
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
