import { describe, expect, test } from 'bun:test';
import { notifyAppearance } from './notify';

describe('notifyAppearance', () => {
  test('maps each kind to a distinct colour', () => {
    expect(notifyAppearance('success').color).toBe('teal');
    expect(notifyAppearance('error').color).toBe('red');
    expect(notifyAppearance('warning').color).toBe('yellow');
    expect(notifyAppearance('info').color).toBe('blue');
  });

  test('each kind has its own icon component', () => {
    const icons = (['success', 'error', 'warning', 'info'] as const).map((k) => notifyAppearance(k).Icon);
    expect(new Set(icons).size).toBe(4);
  });
});
