import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { decryptCredentials, encryptCredentials, parseCredentialKey } from './credentials';

const key = parseCredentialKey(randomBytes(32).toString('base64'));
const secret = { url: 'https://example.com/private/abc123/basic.ics' };

test('round-trips, and the ciphertext hides the value', () => {
  const text = encryptCredentials(key, 'row-1', secret);
  expect(text).toStartWith('v1.');
  expect(text).not.toContain('abc123');
  expect(decryptCredentials(key, 'row-1', text)).toEqual(secret);
  // A fresh IV each time.
  expect(encryptCredentials(key, 'row-1', secret)).not.toBe(text);
});

test('fails for another row, another key, or a changed ciphertext', () => {
  const text = encryptCredentials(key, 'row-1', secret);
  expect(() => decryptCredentials(key, 'row-2', text)).toThrow();
  const other = parseCredentialKey(randomBytes(32).toString('base64'));
  expect(() => decryptCredentials(other, 'row-1', text)).toThrow();
  const [v, iv, body = ''] = text.split('.');
  const flipped = `${body.slice(0, 5)}${body[5] === 'A' ? 'B' : 'A'}${body.slice(6)}`;
  expect(() => decryptCredentials(key, 'row-1', `${v}.${iv}.${flipped}`)).toThrow();
  expect(() => decryptCredentials(key, 'row-1', 'v2.x.y')).toThrow('unknown credentials format');
});

test('keys must be 32 bytes of base64', () => {
  expect(() => parseCredentialKey(randomBytes(16).toString('base64'))).toThrow('32 bytes');
  expect(() => parseCredentialKey('not base64!')).toThrow();
});
