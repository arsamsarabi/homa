# Travel time on events

Status: built, 2026-11-28. Roadmap item 3 (0.4), size M.

An optional travel time before a timed event, as in Apple Calendar. The views draw it as a block above the event with a car icon and "1 hr travel time". It counts as busy for availability, and so for polls in phase 7. It stays in Homa: it isn't synced to Google, Microsoft or CalDAV.

## Data

- New column `events.travel_minutes integer null`. Null means no travel time. The API accepts 1 to 1440 minutes, and Postgres has a matching check.
- It belongs to the whole event. A recurring event has the same travel time on every occurrence, and overrides don't carry it, in the same way as `allDay` and `tz`. A "this occurrence only" change to it is a 400, just as for `allDay`. In the editor, a change to it sets `seriesChanged`, as calendar, time zone and repeat changes do, so the scope question doesn't offer "This event".
- All-day events can't have travel time. Saving `allDay: true` clears it, and the API rejects travel time on an all-day event.
- The `Event` response and the `Occurrence` response gain `travelMinutes: number | null`. `EventInput` and `EventPatch` take it as an optional field.
- Free/busy occurrences keep `travelMinutes`, because the travel window is busy time too and reveals nothing more than the time itself.
- The JSON export includes it. ICS export and import ignore it (see Not in scope).

### Synced events

The sync writes only the columns it reads from the remote copy (`updateEventColumns`), so travel time set on a Google, Microsoft or CalDAV event survives every pull. A pull that turns the event all-day clears it, to keep the check constraint. Saving travel time queues the usual push, which carries no travel time, so the remote copy doesn't change. If the remote copy is deleted, its travel time goes with it. Subscribed (read-only) calendars can't have travel time, because their events can't be edited.

## Editor

- A "Travel time" select under the times, shown only for timed events. The options are None, 5 min, 15 min, 30 min, 1 hr, 1 hr 30 min and 2 hr, as in Apple Calendar. A value outside the list, such as one set through the API, shows as an extra option so it isn't lost.
- For synced calendars the field's hint says "Only in Homa, not synced".
- Read-only and free/busy details show a "1 hr travel time" line when the event has one.

## Views

- **Week, work week and day.** The travel block sits directly above the event, in the same column and at the same width. It uses the calendar colour as a light hatched fill with a dashed edge, so it reads as "not the event". It shows a car icon (`IconCar`) and "{duration} travel time" when there is room, and only the icon when there isn't.
  - Overlap layout uses `start − travel` as the item's start, so an event never draws over another event's travel.
  - The block isn't a target of its own. Clicking it opens the event, and dragging the event moves its travel with it. Resizing the top edge changes the start and leaves the travel length alone.
  - Travel that begins on the day before is clipped at midnight, like any timed event.
- **Agenda.** A muted "{duration} travel time" line under the event's time.
- **Month and year.** Unchanged: there's no room, and the event's own time is what you scan for there.
- The accessible name of an event button ends with "1 hr travel time". The travel block itself is hidden from screen readers.
- The demo seed gives the dentist and a lunch some travel time.

## Availability

- In `getAvailability`, each busy interval starts at `start − travelMinutes` instead of `start`.
- Occurrences are read to `to + 24 h`, the largest travel time allowed, so an event just after the range still contributes its travel. `mergeBusy` already clips to `[from, to)`.
- All-day events still don't count, and they can't have travel time anyway.
- Phase 7 polls and auto-suggest read availability, so they pick this up with no extra work.

## Copy

| Key | en | fa |
| --- | --- | --- |
| `editor.travel` | Travel time | زمان رفت‌وآمد |
| `editor.travelNone` | None | هیچ |
| `editor.travelLocal` | Only in Homa, not synced | فقط در هما، همگام نمی‌شود |
| `calendar.travel` | {{duration}} travel time | {{duration}} رفت‌وآمد |

Durations come from `Intl.NumberFormat` with short hour and minute units ("1 hr 30 min"), and `Intl.DurationFormat` isn't needed.

## Tests

- **Core:** `planChange` rejects `travelMinutes` for scope `this`.
- **Server:**
  - Create, patch and clear travel time.
  - The 1 to 1440 and all-day checks.
  - Travel time survives a pull on a synced calendar.
  - Availability starts the busy interval earlier.
  - An event just after `to` adds its travel to the range.
- **Web:**
  - The layout puts the travel above the event and counts it in overlaps.
  - The editor shows the select only for timed events.
  - The time grid renders the travel block with its label.
- **E2E:** none new. The existing event e2e tests cover the editor path.

## Migration

One additive migration adds the nullable column and the check constraint, with no backfill and no breaking steps.

## Not in scope (follow-ups)

- **Reading and writing `X-APPLE-TRAVEL-DURATION`.** iCloud and Apple Calendar store travel time in this property. Reading it on CalDAV pulls and ICS import, and writing it on push, would give iCloud users two-way travel time. Google and Microsoft have no equivalent.
- A "time to leave" reminder, set relative to the travel start.
- Travel time worked out from the location and a maps service.
- Quick add phrases such as "30 min drive".
- Travel time after an event, for the trip back.

## Also in this PR

Two small polish fixes from the notifications redesign:
- Capitalize the relative day in the notification panel, so it reads "Yesterday" and not "yesterday".
- No focus ring on **Clear all** when the panel opens with a mouse: focus moves to the panel itself, not to its first button.
