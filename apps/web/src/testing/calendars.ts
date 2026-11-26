// Test fixtures for calendars returned by GET /api/calendars (access + owner required).
import type { Calendar } from '@/schemas';

const stamp = '2026-11-01T00:00:00Z';

/** An owned calendar for Ada (session user u1), with optional overrides. */
export const ownCalendar = (partial: Partial<Calendar> & Pick<Calendar, 'id' | 'name'>): Calendar => ({
  color: '#4a4e69',
  connectionId: null,
  readOnly: false,
  hidden: false,
  remoteMissing: false,
  access: 'owner',
  owner: { id: 'u1', name: 'Ada' },
  createdAt: stamp,
  updatedAt: stamp,
  ...partial,
});

/** A calendar shared with the caller by another person. */
export const sharedCalendar = (
  partial: Partial<Calendar> &
    Pick<Calendar, 'id' | 'name'> & {
      access: Exclude<Calendar['access'], 'owner'>;
      owner: Calendar['owner'];
    },
): Calendar => ({
  color: '#336699',
  connectionId: null,
  readOnly: false,
  hidden: false,
  remoteMissing: false,
  createdAt: stamp,
  updatedAt: stamp,
  ...partial,
});
