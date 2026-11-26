// Request and response shapes for people, invites and circles.
import { z } from '@hono/zod-openapi';

export const PEOPLE_LIMITS = {
  pendingInvitesPerUser: 50,
  inviteDays: 7,
  circlesPerUser: 50,
  membersPerCircle: 200,
  circleName: 60,
  /** Max length of an uploaded avatar data URL (~375KB binary). */
  avatarImage: 500_000,
  avatarSeed: 64,
} as const;

const Color = z.string().regex(/^#[0-9a-f]{6}$/i, 'a hex color like #7d7fa3');
const AvatarSeed = z.string().trim().min(1).max(PEOPLE_LIMITS.avatarSeed);
const AvatarImage = z
  .string()
  .max(PEOPLE_LIMITS.avatarImage)
  .regex(/^data:image\/(png|jpeg|webp|gif);base64,/, 'a data:image URL')
  .nullable();

export const WHO_CAN_INVITE = ['admins', 'everyone'] as const;

export const Id = z.object({ id: z.uuid() });

export const Person = z
  .object({ id: z.string(), name: z.string(), email: z.string() })
  .openapi('Person', { description: 'Someone with an account on this instance' });

export const Invite = z
  .object({
    id: z.uuid(),
    email: z.string().nullable().openapi({ description: 'Only this address can use it; null for anyone' }),
    createdBy: z.object({ id: z.string(), name: z.string() }),
    expiresAt: z.iso.datetime(),
    emailed: z.boolean().openapi({ description: 'Homa emailed the link to `email`' }),
    usedAt: z.iso.datetime().nullable(),
    usedBy: z.object({ id: z.string().nullable(), name: z.string().nullable() }).nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi('Invite');

export const CreatedInvite = Invite.extend({
  token: z.string().openapi({ description: 'The secret in the link `/sign-up?invite={token}`. Shown only once' }),
}).openapi('CreatedInvite');

export const InviteInput = z
  .object({
    email: z.email().max(254).toLowerCase().optional().openapi({
      description: 'Only this address can sign up with it; with email set up, Homa emails it the link',
    }),
  })
  .openapi('InviteInput');

export const InviteLookupQuery = z.object({ token: z.string().min(1).max(200) });

export const InviteLookup = z
  .object({
    instanceName: z.string(),
    invitedBy: z.string().openapi({ description: "The inviter's name" }),
    email: z.string().nullable(),
  })
  .openapi('InviteLookup');

export const Circle = z
  .object({
    id: z.uuid(),
    name: z.string(),
    color: Color,
    avatarSeed: AvatarSeed.openapi({ description: 'Seed for the generated identicon when avatarImage is null' }),
    avatarImage: AvatarImage.openapi({ description: 'Uploaded picture as a data URL, or null for the generated one' }),
    memberIds: z.array(z.string()).openapi({ description: 'The people in it, by name' }),
    createdAt: z.iso.datetime(),
  })
  .openapi('Circle');

const CircleName = z.string().trim().min(1).max(PEOPLE_LIMITS.circleName);
export const CircleInput = z
  .object({
    name: CircleName,
    color: Color.optional(),
    avatarSeed: AvatarSeed.optional(),
    avatarImage: AvatarImage.optional(),
    memberIds: z.array(z.string().min(1)).max(PEOPLE_LIMITS.membersPerCircle).optional(),
  })
  .openapi('CircleInput');
export const CirclePatch = z
  .object({
    name: CircleName.optional(),
    color: Color.optional(),
    avatarSeed: AvatarSeed.optional(),
    avatarImage: AvatarImage.optional(),
  })
  .refine(
    (v) => v.name !== undefined || v.color !== undefined || v.avatarSeed !== undefined || v.avatarImage !== undefined,
    {
      message: 'at least one field is required',
    },
  )
  .openapi('CirclePatch');
export const CircleMembers = z
  .object({ memberIds: z.array(z.string().min(1)).max(PEOPLE_LIMITS.membersPerCircle) })
  .openapi('CircleMembers');
