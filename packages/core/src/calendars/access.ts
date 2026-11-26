/**
 * Calendar grant levels and resolution (phase 6b).
 * See docs/design/phase-6-sharing.md decisions 8–10.
 */

/** Levels a grant to a person or circle may set. */
export const GRANT_LEVELS = ['none', 'freebusy', 'read', 'edit'] as const;
export type GrantLevel = (typeof GRANT_LEVELS)[number];

/**
 * Per-calendar default when no person or circle grant applies.
 * Null follows the owner's sharing preset. Never `edit` (decision 10).
 */
export const CALENDAR_DEFAULTS = ['none', 'freebusy', 'read'] as const;
export type CalendarDefault = (typeof CALENDAR_DEFAULTS)[number];

/** Owner's sharing preset (`private` → effective `none`). Never `edit`. */
export const SHARING_PRESETS = ['private', 'freebusy', 'read'] as const;
export type SharingPreset = (typeof SHARING_PRESETS)[number];

/** Effective access for a viewer on one calendar, including owner. */
export type AccessLevel = 'owner' | GrantLevel;

const GRANT_RANK: Record<GrantLevel, number> = {
  none: 0,
  freebusy: 1,
  read: 2,
  edit: 3,
};

const ACCESS_RANK: Record<AccessLevel, number> = {
  none: 0,
  freebusy: 1,
  read: 2,
  edit: 3,
  owner: 4,
};

export type ResolveAccessInput = {
  isOwner: boolean;
  /** Explicit grant to the viewer; null when none is set. A set `none` still wins over circles. */
  personGrant: GrantLevel | null;
  /** Grants from the owner's circles the viewer belongs to. */
  circleGrants: readonly GrantLevel[];
  /** Calendar default, or null to follow the owner's preset. */
  calendarDefault: CalendarDefault | null;
  ownerPreset: SharingPreset;
};

/** Maps a sharing preset to the grant level it implies. */
export function presetToLevel(preset: SharingPreset): GrantLevel {
  return preset === 'private' ? 'none' : preset;
}

/** Strongest grant among `levels`, or undefined when the list is empty. */
export function maxGrantLevel(levels: readonly GrantLevel[]): GrantLevel | undefined {
  let best: GrantLevel | undefined;
  for (const level of levels) {
    if (best === undefined || GRANT_RANK[level] > GRANT_RANK[best]) best = level;
  }
  return best;
}

/**
 * Decision 9: owner → person grant → highest circle grant → calendar default → owner preset.
 * The first that is set wins, so a person grant of `none` beats a circle `read`.
 */
export function resolveAccess(input: ResolveAccessInput): AccessLevel {
  if (input.isOwner) return 'owner';
  if (input.personGrant !== null) return input.personGrant;
  const fromCircles = maxGrantLevel(input.circleGrants);
  if (fromCircles !== undefined) return fromCircles;
  if (input.calendarDefault !== null) return input.calendarDefault;
  return presetToLevel(input.ownerPreset);
}

/** True when `have` is at least as strong as `need` (for route checks). */
export function accessAtLeast(have: AccessLevel, need: AccessLevel): boolean {
  return ACCESS_RANK[have] >= ACCESS_RANK[need];
}
