import { describe, expect, test } from 'bun:test';
import { circleAvatarSrc, hashSeed, identiconDataUrl, randomAvatarSeed } from './circleAvatar';

describe('circleAvatar', () => {
  test('the same seed always hashes the same', () => {
    expect(hashSeed('family')).toBe(hashSeed('family'));
    expect(hashSeed('family')).not.toBe(hashSeed('work'));
  });

  test('identiconDataUrl is a stable SVG data URL', () => {
    const a = identiconDataUrl('abc');
    const b = identiconDataUrl('abc');
    expect(a).toBe(b);
    expect(a.startsWith('data:image/svg+xml')).toBe(true);
    expect(identiconDataUrl('xyz')).not.toBe(a);
  });

  test('circleAvatarSrc prefers an uploaded image', () => {
    expect(circleAvatarSrc({ avatarSeed: 's', avatarImage: 'data:image/png;base64,xx' })).toBe(
      'data:image/png;base64,xx',
    );
    expect(circleAvatarSrc({ avatarSeed: 's', avatarImage: null })).toBe(identiconDataUrl('s'));
  });

  test('randomAvatarSeed returns a non-empty string', () => {
    expect(randomAvatarSeed().length).toBe(16);
  });
});
