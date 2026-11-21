// Each channel kind's settings: what the user enters, how it's checked, and how it's stored (as
// encrypted JSON, with `channel:{id}` as the row id so a ciphertext can't move to another row).
import { ValidationError } from '@homa/core';
import type { ChannelKind } from '@homa/db';
import { assertPublicHost, type CredentialKey, decryptCredentials, encryptCredentials, SyncError } from '@homa/sync';
import { z } from 'zod';

export const NtfyConfig = z.object({
  server: z.string().max(2000),
  topic: z.string().regex(/^[\w-]{1,64}$/),
  token: z.string().max(500).optional(),
});
export const GotifyConfig = z.object({ server: z.string().max(2000), token: z.string().min(1).max(500) });
export const WebhookConfig = z.object({ url: z.string().max(2000), secret: z.string().min(16).max(500) });
export type NtfyConfig = z.infer<typeof NtfyConfig>;
export type GotifyConfig = z.infer<typeof GotifyConfig>;
export type WebhookConfig = z.infer<typeof WebhookConfig>;
export type ChannelConfig = NtfyConfig | GotifyConfig | WebhookConfig;

const PARSERS = { ntfy: NtfyConfig, gotify: GotifyConfig, webhook: WebhookConfig } as const;

const rowId = (id: string): string => `channel:${id}`;

export const sealConfig = (key: CredentialKey, id: string, config: ChannelConfig): string =>
  encryptCredentials(key, rowId(id), config);

/** The stored config, checked against its kind. Throws if the key doesn't open it. */
export function openConfig(
  key: CredentialKey,
  id: string,
  kind: Exclude<ChannelKind, 'email'>,
  text: string,
): ChannelConfig {
  return PARSERS[kind].parse(decryptCredentials(key, rowId(id), text));
}

/**
 * An address a channel may send to: https (http too when private networks are allowed), no user
 * name or password, and (unless allowed) not on a private network. Throws ValidationError.
 */
export async function checkAddress(input: string, allowPrivate: boolean): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ValidationError('That is not a valid address');
  }
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:'))
    throw new ValidationError('The address must start with https://');
  if (url.username || url.password) throw new ValidationError('Put the token in its own field, not in the address');
  try {
    await assertPublicHost(url, allowPrivate);
  } catch (err) {
    if (err instanceof SyncError)
      throw new ValidationError('Addresses on private or local networks are not allowed on this server');
    throw err;
  }
  return url;
}
