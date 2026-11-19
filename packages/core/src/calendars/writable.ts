// Which calendars accept writes. Subscriptions (ICS feeds) are read-only: their events come from
// the feed and every sync would undo a local change.
import { ReadOnlyError } from '../errors';

/** Throws ReadOnlyError unless events in `calendar` can be created, changed or deleted. */
export function assertWritable(calendar: { readOnly: boolean }): void {
  if (calendar.readOnly) throw new ReadOnlyError();
}
