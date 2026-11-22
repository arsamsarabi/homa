// Search params of the pages that account emails link to.
import { z } from 'zod';

/** /verify-email: Better Auth adds `error` (TOKEN_EXPIRED, INVALID_TOKEN, …) when the link failed. */
export const VerifyEmailSearchSchema = z.object({ error: z.string().optional() });
export type VerifyEmailSearch = z.infer<typeof VerifyEmailSearchSchema>;

/** /reset-password: the link's token, or `error` when it expired or was already used. */
export const ResetPasswordSearchSchema = z.object({ token: z.string().optional(), error: z.string().optional() });
export type ResetPasswordSearch = z.infer<typeof ResetPasswordSearchSchema>;
