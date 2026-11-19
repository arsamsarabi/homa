/**
 * A sync or fetch failure, worded so it can be shown to the user and stored as a connection's last
 * error. Messages never include the feed URL (it can hold a private token).
 */
export class SyncError extends Error {
  override name = 'SyncError';
}

/** The server refused a pushed change. `retriable` for answers worth trying again (5xx, 429). */
export class PushError extends SyncError {
  override name = 'PushError';
  constructor(
    message: string,
    readonly retriable: boolean,
  ) {
    super(message);
  }
}

/** The remote resource isn't the version the change was based on (412, or gone): remote wins. */
export class PushConflict extends SyncError {
  override name = 'PushConflict';
  constructor() {
    super('The server has a newer version');
  }
}
