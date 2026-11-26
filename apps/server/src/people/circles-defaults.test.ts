import { describe, expect, test } from 'bun:test';
import { newAvatarSeed, newCircleColor } from './circles-service';

describe('circle defaults', () => {
  test('newAvatarSeed is a non-empty hex-ish string', () => {
    const a = newAvatarSeed();
    const b = newAvatarSeed();
    expect(a.length).toBe(16);
    expect(b.length).toBe(16);
    expect(a).not.toBe(b);
  });

  test('newCircleColor is a hex colour from the palette', () => {
    expect(newCircleColor()).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
