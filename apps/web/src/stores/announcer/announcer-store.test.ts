import { describe, expect, test } from 'bun:test';
import { useAnnouncer } from './announcer-store';

describe('announcer', () => {
  test('announce bumps the id so the same text is read again, and toasts by default', () => {
    const { announce } = useAnnouncer.getState();
    announce('Saved');
    const first = useAnnouncer.getState().id;
    expect(useAnnouncer.getState()).toMatchObject({ message: 'Saved', toast: true });
    announce('Saved');
    expect(useAnnouncer.getState()).toMatchObject({ message: 'Saved', id: first + 1, toast: true });
  });

  test('announce can stay polite-only (no on-screen toast)', () => {
    useAnnouncer.getState().announce('Preview', { toast: false });
    expect(useAnnouncer.getState()).toMatchObject({ message: 'Preview', toast: false });
  });
});
