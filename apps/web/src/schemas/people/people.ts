// People on the instance, invites and circles, as the API returns them.
import { z } from 'zod';

export const PersonSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });
export type Person = z.infer<typeof PersonSchema>;
export const PersonListSchema = z.array(PersonSchema);

export const InviteSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  expiresAt: z.string(),
  emailed: z.boolean(),
  usedAt: z.string().nullable(),
  usedBy: z.object({ id: z.string().nullable(), name: z.string().nullable() }).nullable(),
  createdAt: z.string(),
});
export type Invite = z.infer<typeof InviteSchema>;
export const InviteListSchema = z.array(InviteSchema);
export const CreatedInviteSchema = InviteSchema.extend({ token: z.string() });
export type CreatedInvite = z.infer<typeof CreatedInviteSchema>;

export const InviteLookupSchema = z.object({
  instanceName: z.string(),
  invitedBy: z.string(),
  email: z.string().nullable(),
});
export type InviteLookup = z.infer<typeof InviteLookupSchema>;

/** `/sign-up?invite=…` */
export const SignUpSearchSchema = z.object({ invite: z.string().min(1).max(200).optional().catch(undefined) });
export type SignUpSearch = z.infer<typeof SignUpSearchSchema>;

export const CircleSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  avatarSeed: z.string(),
  avatarImage: z.string().nullable(),
  memberIds: z.array(z.string()),
  createdAt: z.string(),
});
export type Circle = z.infer<typeof CircleSchema>;
export const CircleListSchema = z.array(CircleSchema);
