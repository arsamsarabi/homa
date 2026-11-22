// A user's projects and tags. Names are unique per user, ignoring case.
import { NotFoundError, TASK_LIMITS, ValidationError } from '@homa/core';
import { type Db, repo } from '@homa/db';

export const listProjects = (db: Db, userId: string): Promise<repo.ProjectRow[]> => repo.listProjects(db, userId);

export function createProject(
  db: Db,
  userId: string,
  input: { name: string; color?: string | null },
): Promise<repo.ProjectRow> {
  return db.transaction(async (tx) => {
    if ((await repo.countProjects(tx, userId)) >= TASK_LIMITS.projectsPerUser)
      throw new ValidationError(`You can have at most ${TASK_LIMITS.projectsPerUser} projects`);
    if (await repo.projectNameTaken(tx, userId, input.name))
      throw new ValidationError(`You already have a project called "${input.name}"`);
    return repo.insertProject(tx, userId, { name: input.name, color: input.color ?? null });
  });
}

export function updateProject(
  db: Db,
  userId: string,
  id: string,
  patch: { name?: string; color?: string | null },
): Promise<repo.ProjectRow> {
  return db.transaction(async (tx) => {
    const current = await repo.findOwnedProject(tx, userId, id);
    if (!current) throw new NotFoundError();
    if (Object.keys(patch).length === 0) return current;
    if (patch.name && (await repo.projectNameTaken(tx, userId, patch.name, id)))
      throw new ValidationError(`You already have a project called "${patch.name}"`);
    const row = await repo.updateOwnedProject(tx, userId, id, patch);
    if (!row) throw new NotFoundError();
    return row;
  });
}

/** Deletes a project; its tasks move to the Inbox. */
export async function deleteProject(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.deleteOwnedProject(db, userId, id))) throw new NotFoundError();
}

export const listTags = (db: Db, userId: string): Promise<repo.TagRow[]> => repo.listTags(db, userId);

export function renameTag(db: Db, userId: string, id: string, name: string): Promise<repo.TagRow> {
  return db.transaction(async (tx) => {
    const [other] = await repo.findTagsByName(tx, userId, [name]);
    if (other && other.id !== id) throw new ValidationError(`You already have a tag called "${other.name}"`);
    const row = await repo.renameOwnedTag(tx, userId, id, name);
    if (!row) throw new NotFoundError();
    return row;
  });
}

/** Deletes a tag; it comes off every task. */
export async function deleteTag(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.deleteOwnedTag(db, userId, id))) throw new NotFoundError();
}
