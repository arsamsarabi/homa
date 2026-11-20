// The interface every provider implements (ICS, CalDAV, Google and Microsoft).
// The worker drives it: listCalendars when a connection is added, pullChanges on every sync, and
// pushChange for each outbox entry of a writable calendar. See docs/product/architecture.md ("Sync").
import type { IcsEvent } from '@homa/core';

/** Where a calendar's last pull left off. Each provider uses the fields it needs. */
export type SyncCursor = {
  /** ICS: the feed's ETag and Last-Modified, for a conditional GET. */
  remoteEtag: string | null;
  remoteLastModified: string | null;
  /** ICS: a SHA-256 of the last body, so an unchanged feed without validators is skipped too. */
  contentHash: string | null;
  /** CalDAV sync-token or Google syncToken (Microsoft lists the whole calendar each time, so none). */
  syncToken: string | null;
};

export const EMPTY_CURSOR: SyncCursor = {
  remoteEtag: null,
  remoteLastModified: null,
  contentHash: null,
  syncToken: null,
};

export type RemoteCalendar = {
  /** The provider's id for the calendar (CalDAV: the collection's URL; Google: the calendar id); null for an ICS feed. */
  remoteId: string | null;
  name: string | null;
  /** `#rrggbb`, when the provider has one. */
  color?: string | null;
  readOnly: boolean;
};

/** One remote resource (a CalDAV object, a Google event): its URL, ETag and the events in it (a series with its overrides). */
export type RemoteResource = { href: string; etag: string | null; events: IcsEvent[] };

/**
 * What a pull found. `snapshot` is the whole calendar (ICS): events not in it are gone. `delta`
 * lists the resources that changed and the hrefs that were deleted since the cursor.
 */
export type PullResult =
  | { kind: 'unchanged'; cursor: SyncCursor }
  | {
      kind: 'snapshot';
      name: string | null;
      events: IcsEvent[];
      skipped: number;
      warnings: string[];
      cursor: SyncCursor;
    }
  | {
      kind: 'delta';
      changed: RemoteResource[];
      deleted: string[];
      skipped: number;
      warnings: string[];
      cursor: SyncCursor;
    };

/**
 * A local change to send (from the outbox). A put with `etag` replaces that version (If-Match); a
 * put without one creates the resource (If-None-Match: *). A delete needs the version it deletes.
 */
export type ChangeOp =
  | { kind: 'put'; href: string; ics: string; etag: string | null }
  | { kind: 'delete'; href: string; etag: string };

export interface SyncAdapter {
  listCalendars(): Promise<RemoteCalendar[]>;
  /** `known` maps the hrefs Homa holds to their ETags, so unchanged resources aren't downloaded. */
  pullChanges(
    calendar: RemoteCalendar,
    since: SyncCursor,
    known?: ReadonlyMap<string, string | null>,
  ): Promise<PullResult>;
  /**
   * Returns the new ETag (null if the server didn't say), and `href` when the server chose where a
   * new resource lives (Microsoft Graph assigns event ids). Throws PushConflict when the remote
   * version isn't the expected one, PushError when the server refused, ReadOnlyError for ICS.
   */
  pushChange(op: ChangeOp): Promise<{ etag: string | null; href?: string }>;
  /** The resource as the server has it now, or null if it's gone. */
  fetchResource(href: string): Promise<RemoteResource | null>;
  /**
   * Where a new event with `uid` goes in the calendar `calendarRemoteId` (stable, so a retried create
   * can't duplicate it). For Microsoft it's a placeholder until the push returns the real href.
   */
  newHref(calendarRemoteId: string, uid: string): string;
}
