import { useSession } from '@/hooks/session';
import type { Occurrence } from '@/schemas';

/** The name of whoever added this event, when that's someone other than `me`; undefined otherwise. */
export const addedByName = (o: Occurrence | undefined, me: string | undefined): string | undefined => {
  const by = o?.createdBy;
  return by?.name && by.id !== me ? by.name : undefined;
};

/** The signed-in user's id, for addedByName. */
export const useMyId = (): string | undefined => useSession().data?.user.id;

export const useAddedBy = (o: Occurrence | undefined): string | undefined => addedByName(o, useMyId());
