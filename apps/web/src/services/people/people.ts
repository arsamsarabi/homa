// Pure rules for the People settings: an invite's state, and its link.
import type { Invite } from '@/schemas';

export type InviteStatus = 'pending' | 'used' | 'expired';

export const inviteStatus = (invite: Invite, now: Date): InviteStatus =>
  invite.usedAt ? 'used' : new Date(invite.expiresAt) <= now ? 'expired' : 'pending';

/** The sign-up link for an invite token, on this web app's origin. */
export const inviteLink = (origin: string, token: string): string =>
  `${origin}/sign-up?invite=${encodeURIComponent(token)}`;
