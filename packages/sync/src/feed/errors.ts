/**
 * A sync or fetch failure, worded so it can be shown to the user and stored as a connection's last
 * error. Messages never include the feed URL (it can hold a private token).
 */
export class SyncError extends Error {
  override name = 'SyncError';
}
