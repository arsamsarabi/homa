// A user's projects and tags, always filtered by owner. Names are unique per owner, ignoring case.
import { and, asc, count, eq, inArray, ne, type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { projects, tags } from '../schema';

export type ProjectRow = typeof projects.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type ProjectValues = { name: string; color: string | null };

const ownedProject = (ownerUserId: string, id: string): SQL | undefined =>
  and(eq(projects.id, id), eq(projects.ownerUserId, ownerUserId));
const ownedTag = (ownerUserId: string, id: string): SQL | undefined =>
  and(eq(tags.id, id), eq(tags.ownerUserId, ownerUserId));

export const listProjects = (db: Executor, ownerUserId: string): Promise<ProjectRow[]> =>
  db.select().from(projects).where(eq(projects.ownerUserId, ownerUserId)).orderBy(sql`lower(${projects.name})`);

export async function findOwnedProject(db: Executor, ownerUserId: string, id: string): Promise<ProjectRow | undefined> {
  const [row] = await db.select().from(projects).where(ownedProject(ownerUserId, id));
  return row;
}

/** True when the owner has another project (not `exceptId`) with this name, ignoring case. */
export async function projectNameTaken(
  db: Executor,
  ownerUserId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.ownerUserId, ownerUserId),
        sql`lower(${projects.name}) = ${name.toLowerCase()}`,
        exceptId ? ne(projects.id, exceptId) : undefined,
      ),
    );
  return row !== undefined;
}

export async function countProjects(db: Executor, ownerUserId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(projects).where(eq(projects.ownerUserId, ownerUserId));
  return row?.n ?? 0;
}

export async function insertProject(db: Executor, ownerUserId: string, v: ProjectValues): Promise<ProjectRow> {
  const [row] = await db
    .insert(projects)
    .values({ ownerUserId, ...v })
    .returning();
  if (!row) throw new Error('insert into projects returned no row');
  return row;
}

/** Returns the updated row, or undefined if it isn't the owner's. Callers don't pass an empty patch. */
export async function updateOwnedProject(
  db: Executor,
  ownerUserId: string,
  id: string,
  patch: Partial<ProjectValues>,
): Promise<ProjectRow | undefined> {
  const [row] = await db.update(projects).set(patch).where(ownedProject(ownerUserId, id)).returning();
  return row;
}

/** True if a row was deleted. Its tasks move to the Inbox (the foreign key sets them null). */
export async function deleteOwnedProject(db: Executor, ownerUserId: string, id: string): Promise<boolean> {
  const rows = await db.delete(projects).where(ownedProject(ownerUserId, id)).returning({ id: projects.id });
  return rows.length > 0;
}

export const listTags = (db: Executor, ownerUserId: string): Promise<TagRow[]> =>
  db
    .select()
    .from(tags)
    .where(eq(tags.ownerUserId, ownerUserId))
    .orderBy(sql`lower(${tags.name})`, asc(tags.createdAt));

export async function countTags(db: Executor, ownerUserId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(tags).where(eq(tags.ownerUserId, ownerUserId));
  return row?.n ?? 0;
}

/** The owner's tags with these names (ignoring case). */
export const findTagsByName = (db: Executor, ownerUserId: string, names: readonly string[]): Promise<TagRow[]> =>
  names.length
    ? db
        .select()
        .from(tags)
        .where(
          and(
            eq(tags.ownerUserId, ownerUserId),
            inArray(
              sql`lower(${tags.name})`,
              names.map((n) => n.toLowerCase()),
            ),
          ),
        )
    : Promise.resolve([]);

export async function findOwnedTag(db: Executor, ownerUserId: string, id: string): Promise<TagRow | undefined> {
  const [row] = await db.select().from(tags).where(ownedTag(ownerUserId, id));
  return row;
}

export async function renameOwnedTag(
  db: Executor,
  ownerUserId: string,
  id: string,
  name: string,
): Promise<TagRow | undefined> {
  const [row] = await db.update(tags).set({ name }).where(ownedTag(ownerUserId, id)).returning();
  return row;
}

/** True if a row was deleted (it comes off every task). */
export async function deleteOwnedTag(db: Executor, ownerUserId: string, id: string): Promise<boolean> {
  const rows = await db.delete(tags).where(ownedTag(ownerUserId, id)).returning({ id: tags.id });
  return rows.length > 0;
}
