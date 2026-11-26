import { describe, expect, test } from 'bun:test';
import { useAnnouncer } from './announcer-store';

describe('announcer', () => {
  test('announce bumps the id so the same text is read again, and toasts success by default', () => {
    const { announce } = useAnnouncer.getState();
    announce('Saved');
    const first = useAnnouncer.getState().id;
    expect(useAnnouncer.getState()).toMatchObject({ message: 'Saved', toast: true, kind: 'success' });
    announce('Saved');
    expect(useAnnouncer.getState()).toMatchObject({ message: 'Saved', id: first + 1, toast: true, kind: 'success' });
  });

  test('announce can stay polite-only (no on-screen toast)', () => {
    useAnnouncer.getState().announce('Preview', { toast: false });
    expect(useAnnouncer.getState()).toMatchObject({ message: 'Preview', toast: false });
  });

  test('announce can set an error kind for failed mutations', () => {
    useAnnouncer.getState().announce('Could not save', { kind: 'error' });
    expect(useAnnouncer.getState()).toMatchObject({ message: 'Could not save', toast: true, kind: 'error' });
  });
});
