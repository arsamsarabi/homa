import { expect, test } from 'bun:test';
import { useAnnouncer } from './announcer-store';

test('announcing the same message twice still changes the id', () => {
  const { announce } = useAnnouncer.getState();
  announce('Saved');
  const first = useAnnouncer.getState().id;
  announce('Saved');
  expect(useAnnouncer.getState()).toMatchObject({ message: 'Saved', id: first + 1 });
});
