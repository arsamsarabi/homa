// Pure rules for calendar access on the web: which calendars are writable, how to label
// free/busy occurrences, and how to group the filter and picker by owner.
import type { Calendar } from '@/schemas';

export type AccessLevel = Calendar['access'];

/** Events can be created or moved here: your own non-subscription calendars, or ones shared at edit. */
export const isWritableCalendar = (c: Calendar): boolean =>
  c.access === 'edit' || (c.access === 'owner' && !c.readOnly);

/** Subscriptions and shared calendars at freebusy/read: open as details, no drag-to-move. */
export const isReadOnlyCalendar = (c: Calendar): boolean => !isWritableCalendar(c);

export const isFreeBusyCalendar = (c: Calendar): boolean => c.access === 'freebusy';

/** Title shown in views: free/busy blocks are always "Busy", never the empty API summary. */
export const occurrenceTitle = (
  summary: string,
  access: AccessLevel | undefined,
  labels: { busy: string; untitled: string },
): string => {
  if (access === 'freebusy') return labels.busy;
  return summary || labels.untitled;
};

export type SharedOwnerGroup = {
  ownerId: string;
  ownerName: string;
  calendars: Calendar[];
};

/** Shared calendars (not yours), grouped by owner, owners sorted by name. */
export const groupSharedByOwner = (calendars: readonly Calendar[]): SharedOwnerGroup[] => {
  const byOwner = new Map<string, SharedOwnerGroup>();
  for (const c of calendars) {
    if (c.access === 'owner') continue;
    const existing = byOwner.get(c.owner.id);
    if (existing) existing.calendars.push(c);
    else byOwner.set(c.owner.id, { ownerId: c.owner.id, ownerName: c.owner.name, calendars: [c] });
  }
  return [...byOwner.values()].sort((a, b) => a.ownerName.localeCompare(b.ownerName));
};

export type PickerGroup = { group: string; items: { value: string; label: string }[] };

/**
 * Calendar picker options: your writable calendars, then each shared-with-edit owner's calendars.
 * `mineLabel` is the group heading for your own; `sharedBy` builds "Shared by Ada".
 */
export const writableCalendarPickerGroups = (
  calendars: readonly Calendar[],
  mineLabel: string,
  sharedBy: (name: string) => string,
): PickerGroup[] => {
  const writable = calendars.filter(isWritableCalendar);
  const mine = writable.filter((c) => c.access === 'owner');
  const shared = groupSharedByOwner(writable.filter((c) => c.access === 'edit'));
  const groups: PickerGroup[] = [];
  if (mine.length) groups.push({ group: mineLabel, items: mine.map((c) => ({ value: c.id, label: c.name })) });
  for (const g of shared) {
    groups.push({
      group: sharedBy(g.ownerName),
      items: g.calendars.map((c) => ({ value: c.id, label: c.name })),
    });
  }
  return groups;
};
