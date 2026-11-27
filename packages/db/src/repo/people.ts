// People on the instance: the directory, invite links and circles. Circles are filtered by owner.
import { and, asc, count, desc, eq, gt, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../client';
import { circleMembers, circles, invites, users } from '../schema';

export type Person = { id: string; name: string; email: string };
export type InviteRow = typeof invites.$inferSelect;
export type InviteView = InviteRow & { createdByName: string; usedByName: string | null };
export type CircleRow = typeof circles.$inferSelect;
export type CircleWithMembers = CircleRow & { memberIds: string[] };

/** Everyone on the instance except `exceptId`, banned accounts left out, by name. */
export const listPeople = (db: Executor, exceptId: string): Promise<Person[]> =>
  db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(ne(users.id, exceptId), eq(users.banned, false)))
    .orderBy(sql`lower(${users.name})`, asc(users.email));

/** Which of these ids are accounts on the instance (not banned). */
export async function existingUserIds(db: Executor, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, [...ids]), eq(users.banned, false)));
  return new Set(rows.map((r) => r.id));
}

// --- Invites ---------------------------------------------------------------------------------

export type NewInvite = {
  tokenHash: string;
  email: string | null;
  createdBy: string;
  expiresAt: Date;
  emailed: boolean;
};

export async function insertInvite(db: Executor, v: NewInvite): Promise<InviteRow> {
  const [row] = await db.insert(invites).values(v).returning();
  if (!row) throw new Error('insert into invites returned no row');
  return row;
}

export async function setInviteEmailed(db: Executor, id: string): Promise<void> {
  await db.update(invites).set({ emailed: true }).where(eq(invites.id, id));
}

const pending = (now: Date): SQL | undefined => and(isNull(invites.usedAt), gt(invites.expiresAt, now));

export async function countPendingInvites(db: Executor, createdBy: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(invites)
    .where(and(eq(invites.createdBy, createdBy), pending(now)));
  return row?.n ?? 0;
}

/** Invites, newest first: one inviter's (or everyone's), or the one with `id`. At most 200. */
export async function listInvites(db: Executor, by: { createdBy?: string; id?: string } = {}): Promise<InviteView[]> {
  const usedBy = sql<string | null>`(select u.name from users u where u.id = ${invites.usedBy})`;
  const rows = await db
    .select({ invite: invites, createdByName: users.name, usedByName: usedBy })
    .from(invites)
    .innerJoin(users, eq(users.id, invites.createdBy))
    .where(
      and(by.createdBy ? eq(invites.createdBy, by.createdBy) : undefined, by.id ? eq(invites.id, by.id) : undefined),
    )
    .orderBy(desc(invites.createdAt))
    .limit(200);
  return rows.map((r) => ({ ...r.invite, createdByName: r.createdByName, usedByName: r.usedByName }));
}

/** An unused, unexpired invite by its token's hash, with its inviter's name. */
export async function findPendingInvite(
  db: Executor,
  tokenHash: string,
  now: Date,
): Promise<(InviteRow & { createdByName: string }) | undefined> {
  const [row] = await db
    .select({ invite: invites, createdByName: users.name })
    .from(invites)
    .innerJoin(users, eq(users.id, invites.createdBy))
    .where(and(eq(invites.tokenHash, tokenHash), pending(now)));
  return row && { ...row.invite, createdByName: row.createdByName };
}

/**
 * Marks a pending invite used, atomically, so two sign-ups can't share one. Returns it, or
 * undefined when the token is unknown, used or expired.
 */
export async function claimInvite(db: Executor, tokenHash: string, now: Date): Promise<InviteRow | undefined> {
  const [row] = await db
    .update(invites)
    .set({ usedAt: now })
    .where(and(eq(invites.tokenHash, tokenHash), pending(now)))
    .returning();
  return row;
}

/** Records who used a claimed invite; returns who created it, or undefined if it was already recorded. */
export async function setInviteUsedByToken(
  db: Executor,
  tokenHash: string,
  userId: string,
): Promise<{ createdBy: string } | undefined> {
  const [row] = await db
    .update(invites)
    .set({ usedBy: userId })
    .where(and(eq(invites.tokenHash, tokenHash), isNull(invites.usedBy)))
    .returning({ createdBy: invites.createdBy });
  return row;
}

/** True when an account uses this address, ignoring case. */
export async function emailTaken(db: Executor, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  return row !== undefined;
}

/** Deletes an unused invite: the inviter's, or anyone's without `createdBy`. True if one went. */
export async function deleteUnusedInvite(db: Executor, id: string, createdBy?: string): Promise<boolean> {
  const rows = await db
    .delete(invites)
    .where(and(eq(invites.id, id), isNull(invites.usedAt), createdBy ? eq(invites.createdBy, createdBy) : undefined))
    .returning({ id: invites.id });
  return rows.length > 0;
}

// --- Circles ---------------------------------------------------------------------------------

const ownedCircle = (ownerUserId: string, id: string): SQL | undefined =>
  and(eq(circles.id, id), eq(circles.ownerUserId, ownerUserId));

async function withMembers(db: Executor, rows: CircleRow[]): Promise<CircleWithMembers[]> {
  if (!rows.length) return [];
  const members = await db
    .select({ circleId: circleMembers.circleId, userId: circleMembers.userId })
    .from(circleMembers)
    .innerJoin(users, eq(users.id, circleMembers.userId))
    .where(
      inArray(
        circleMembers.circleId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(sql`lower(${users.name})`);
  return rows.map((r) => ({ ...r, memberIds: members.filter((m) => m.circleId === r.id).map((m) => m.userId) }));
}

export async function listCircles(db: Executor, ownerUserId: string): Promise<CircleWithMembers[]> {
  return withMembers(
    db,
    await db.select().from(circles).where(eq(circles.ownerUserId, ownerUserId)).orderBy(sql`lower(${circles.name})`),
  );
}

export async function findOwnedCircle(
  db: Executor,
  ownerUserId: string,
  id: string,
): Promise<CircleWithMembers | undefined> {
  const rows = await db.select().from(circles).where(ownedCircle(ownerUserId, id));
  return (await withMembers(db, rows))[0];
}

export async function countCircles(db: Executor, ownerUserId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(circles).where(eq(circles.ownerUserId, ownerUserId));
  return row?.n ?? 0;
}

/** True when the owner has another circle (not `exceptId`) with this name, ignoring case. */
export async function circleNameTaken(
  db: Executor,
  ownerUserId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: circles.id })
    .from(circles)
    .where(
      and(
        eq(circles.ownerUserId, ownerUserId),
        sql`lower(${circles.name}) = ${name.toLowerCase()}`,
        exceptId ? ne(circles.id, exceptId) : undefined,
      ),
    );
  return row !== undefined;
}

export type CircleValues = {
  name: string;
  color: string;
  avatarSeed: string;
  avatarImage: string | null;
};

export async function insertCircle(db: Executor, ownerUserId: string, values: CircleValues): Promise<CircleRow> {
  const [row] = await db
    .insert(circles)
    .values({ ownerUserId, ...values })
    .returning();
  if (!row) throw new Error('insert into circles returned no row');
  return row;
}

/** Returns the updated row, or undefined if it isn't the owner's. Callers don't pass an empty patch. */
export async function updateOwnedCircle(
  db: Executor,
  ownerUserId: string,
  id: string,
  patch: Partial<CircleValues>,
): Promise<CircleRow | undefined> {
  const [row] = await db.update(circles).set(patch).where(ownedCircle(ownerUserId, id)).returning();
  return row;
}

/** Deletes the circle (its members and grants cascade). Returns false if it isn't the owner's. */
export async function deleteOwnedCircle(db: Executor, ownerUserId: string, id: string): Promise<boolean> {
  const rows = await db.delete(circles).where(ownedCircle(ownerUserId, id)).returning({ id: circles.id });
  return rows.length > 0;
}

/** Replaces a circle's members. Callers have checked the circle is the user's and the ids exist. */
export async function replaceCircleMembers(db: Executor, circleId: string, userIds: readonly string[]): Promise<void> {
  await db.delete(circleMembers).where(eq(circleMembers.circleId, circleId));
  if (userIds.length) await db.insert(circleMembers).values(userIds.map((userId) => ({ circleId, userId })));
}

/** The owner's circle with this name, ignoring case. */
export async function findCircleByName(
  db: Executor,
  ownerUserId: string,
  name: string,
): Promise<CircleRow | undefined> {
  const [row] = await db
    .select()
    .from(circles)
    .where(and(eq(circles.ownerUserId, ownerUserId), sql`lower(${circles.name}) = ${name.toLowerCase()}`));
  return row;
}

/** Adds one member; a no-op when they're already in the circle. */
export async function addCircleMember(db: Executor, circleId: string, userId: string): Promise<void> {
  await db.insert(circleMembers).values({ circleId, userId }).onConflictDoNothing();
}
