// Invite links. The token is shown once; only its SHA-256 is stored. An invite lets one person sign
// up (even with sign-ups closed), for 7 days, optionally only with the address it names.
import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenError, NotFoundError, ValidationError } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';
import { getInstanceSettings } from '@/instance/instance-service';
import { log } from '@/log';
import type { Mail } from '@/reminders';
import { createCircle } from './circles-service';
import { inviteEmail } from './invite-email';
import { PEOPLE_LIMITS } from './schemas';

/** The header the web app sends the invite token in when it signs up. */
export const INVITE_HEADER = 'x-homa-invite';
export const INVITE_UNUSABLE = 'This invite link has expired or has already been used. Ask for a new one.';
export const INVITE_OTHER_EMAIL = 'This invite is for another email address.';

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const DAY_MS = 86_400_000;

async function isAdmin(db: Executor, userId: string): Promise<boolean> {
  return (await repo.findUserRole(db, userId)) === 'admin';
}

/** Throws unless the user may invite on this instance. */
export async function requireCanInvite(db: Db, userId: string): Promise<void> {
  if (await isAdmin(db, userId)) return;
  if ((await getInstanceSettings(db)).invites !== 'everyone')
    throw new ForbiddenError('Only an admin can invite people to this Homa');
}

export type CreatedInvite = repo.InviteView & { token: string };

/**
 * Creates an invite. With `mail` and an address, emails the link (in `language`); a failed email
 * is logged, and the invite is still returned so the link can be copied.
 */
export async function createInvite(
  db: Db,
  userId: string,
  input: { email?: string },
  mail?: { send: (m: Mail) => Promise<void>; appUrl: string; language: 'en' | 'fa' },
): Promise<CreatedInvite> {
  await requireCanInvite(db, userId);
  const now = new Date();
  if ((await repo.countPendingInvites(db, userId, now)) >= PEOPLE_LIMITS.pendingInvitesPerUser)
    throw new ValidationError(`You can have at most ${PEOPLE_LIMITS.pendingInvitesPerUser} open invites`);
  const email = input.email ?? null;
  if (email && (await repo.emailTaken(db, email)))
    throw new ValidationError('Someone with that email already has an account here');
  const token = randomBytes(32).toString('base64url');
  const row = await repo.insertInvite(db, {
    tokenHash: hashToken(token),
    email,
    createdBy: userId,
    expiresAt: new Date(now.getTime() + PEOPLE_LIMITS.inviteDays * DAY_MS),
    emailed: false,
  });
  const view = async (): Promise<repo.InviteView> => {
    const [v] = await repo.listInvites(db, { id: row.id });
    if (!v) throw new Error('the new invite is missing');
    return v;
  };
  if (email && mail) {
    const { name } = await getInstanceSettings(db);
    const url = new URL(`/sign-up?invite=${token}`, mail.appUrl).href;
    try {
      const inviter = (await view()).createdByName;
      await mail.send(inviteEmail(mail.language, email, { inviter, instance: name }, url, mail.appUrl));
      await repo.setInviteEmailed(db, row.id);
    } catch (err: unknown) {
      log.warn('invite email failed', { inviteId: row.id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }
  return { ...(await view()), token };
}

/** The caller's invites; an admin sees everyone's. */
export async function listInvites(db: Db, userId: string): Promise<repo.InviteView[]> {
  return repo.listInvites(db, (await isAdmin(db, userId)) ? {} : { createdBy: userId });
}

/** Revokes an unused invite: an admin's any, everyone else's only their own. */
export async function revokeInvite(db: Db, userId: string, id: string): Promise<void> {
  const ok = await repo.deleteUnusedInvite(db, id, (await isAdmin(db, userId)) ? undefined : userId);
  if (!ok) throw new NotFoundError();
}

/** What the sign-up page shows for an invite link; NotFoundError for an unusable one. */
export async function lookupInvite(
  db: Db,
  token: string,
): Promise<{ instanceName: string; invitedBy: string; email: string | null }> {
  const invite = await repo.findPendingInvite(db, hashToken(token), new Date());
  if (!invite) throw new NotFoundError();
  return { instanceName: (await getInstanceSettings(db)).name, invitedBy: invite.createdByName, email: invite.email };
}

/**
 * Uses an invite for a sign-up with `email`: checks it names that address (if it names one), then
 * claims it so nobody else can. Returns whether the address is proven (the link was emailed to it).
 * Throws ValidationError for an unusable invite or another address.
 */
export async function claimInviteForSignUp(db: Db, token: string, email: string): Promise<{ emailProven: boolean }> {
  const hash = hashToken(token);
  const now = new Date();
  const invite = await repo.findPendingInvite(db, hash, now);
  if (!invite) throw new ValidationError(INVITE_UNUSABLE);
  if (invite.email && invite.email !== email.toLowerCase()) throw new ValidationError(INVITE_OTHER_EMAIL);
  const claimed = await repo.claimInvite(db, hash, now);
  if (!claimed) throw new ValidationError(INVITE_UNUSABLE);
  return { emailProven: claimed.emailed && claimed.email === email.toLowerCase() };
}

/** The circle each inviter's new people join, so they're ready to share with. */
export const INVITED_CIRCLE = 'Invited';

/**
 * Records who signed up with the (already claimed) invite and adds them to the inviter's
 * "Invited" circle, creating it when missing. A failed circle step is logged, never fatal.
 */
export async function recordInviteUse(db: Db, token: string, userId: string): Promise<void> {
  const invite = await repo.setInviteUsedByToken(db, hashToken(token), userId);
  if (!invite) return;
  try {
    await addToInvitedCircle(db, invite.createdBy, userId);
  } catch (err: unknown) {
    log.warn('adding to the invited circle failed', { error: err instanceof Error ? err.message : 'unknown' });
  }
}

async function addToInvitedCircle(db: Db, inviterId: string, userId: string): Promise<void> {
  const existing = await repo.findCircleByName(db, inviterId, INVITED_CIRCLE);
  if (existing) await repo.addCircleMember(db, existing.id, userId);
  // At the circle limit this throws, and the caller logs it.
  else await createCircle(db, inviterId, { name: INVITED_CIRCLE, memberIds: [userId] });
}
