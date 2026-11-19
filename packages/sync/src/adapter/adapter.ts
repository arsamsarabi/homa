// The interface every provider implements (ICS now; CalDAV, Google and Microsoft in later phases).
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
  /** CalDAV sync-token, Google syncToken or Graph delta link. */
  syncToken: string | null;
};

export const EMPTY_CURSOR: SyncCursor = {
  remoteEtag: null,
  remoteLastModified: null,
  contentHash: null,
  syncToken: null,
};

export type RemoteCalendar = {
  /** The provider's id for the calendar; null for an ICS feed (one calendar per connection). */
  remoteId: string | null;
  name: string | null;
  readOnly: boolean;
};

/**
 * What a pull found. `snapshot` is the whole calendar (ICS): events not in it are gone. Incremental
 * providers will add a `delta` kind with changed events and deleted UIDs.
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
    };

/** A local change to send to the provider (from the outbox). */
export type ChangeOp =
  | { kind: 'put'; calendarRemoteId: string; uid: string; ics: string; etag: string | null }
  | { kind: 'delete'; calendarRemoteId: string; uid: string; etag: string | null };

export interface SyncAdapter {
  listCalendars(): Promise<RemoteCalendar[]>;
  pullChanges(calendar: RemoteCalendar, since: SyncCursor): Promise<PullResult>;
  /** Returns the new ETag. Read-only providers throw ReadOnlyError. */
  pushChange(op: ChangeOp): Promise<{ etag: string | null }>;
}
