// Database rows to API responses.
import type { repo } from '@homa/db';
import type { z } from '@hono/zod-openapi';
import type { Circle, Invite } from './schemas';

export const inviteOut = (i: repo.InviteView): z.infer<typeof Invite> => ({
  id: i.id,
  email: i.email,
  createdBy: { id: i.createdBy, name: i.createdByName },
  expiresAt: i.expiresAt.toISOString(),
  emailed: i.emailed,
  usedAt: i.usedAt?.toISOString() ?? null,
  usedBy: i.usedAt ? { id: i.usedBy, name: i.usedByName } : null,
  createdAt: i.createdAt.toISOString(),
});

export const circleOut = (c: repo.CircleWithMembers): z.infer<typeof Circle> => ({
  id: c.id,
  name: c.name,
  color: c.color,
  avatarSeed: c.avatarSeed,
  avatarImage: c.avatarImage,
  memberIds: c.memberIds,
  createdAt: c.createdAt.toISOString(),
});
