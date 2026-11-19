// Provider credentials at rest: AES-256-GCM with the app key (HOMA_ENCRYPTION_KEY). The row id is
// the associated data, so a ciphertext copied onto another connection fails to decrypt.
// Format: "v1.<iv>.<ciphertext><tag>", both base64url; the version leaves room for key rotation.
import { createCipheriv, createDecipheriv, createSecretKey, type KeyObject, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type CredentialKey = KeyObject;

/** The app key from its base64 form (32 bytes: `openssl rand -base64 32`). Throws on anything else. */
export function parseCredentialKey(base64: string): CredentialKey {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length !== 32 || bytes.toString('base64') !== base64.trim())
    throw new Error('the key must be 32 bytes, base64-encoded (openssl rand -base64 32)');
  return createSecretKey(bytes);
}

const aad = (rowId: string): Buffer => Buffer.from(`homa:connection:${rowId}`);

/**
 * Encrypts `value` (as JSON) for the row `rowId`.
 * @example encryptCredentials(key, connection.id, { url: 'https://…/basic.ics' })
 */
export function encryptCredentials(key: CredentialKey, rowId: string, value: unknown): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv).setAAD(aad(rowId));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return `${VERSION}.${iv.toString('base64url')}.${body.toString('base64url')}`;
}

/** Decrypts what encryptCredentials made for `rowId`. Throws if the key, row or text don't match. */
export function decryptCredentials(key: CredentialKey, rowId: string, text: string): unknown {
  const [version, iv, body] = text.split('.');
  if (version !== VERSION || !iv || !body) throw new Error('unknown credentials format');
  const bytes = Buffer.from(body, 'base64url');
  if (bytes.length < TAG_BYTES) throw new Error('credentials are truncated');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url')).setAAD(aad(rowId));
  decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
  const plain = Buffer.concat([decipher.update(bytes.subarray(0, bytes.length - TAG_BYTES)), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
