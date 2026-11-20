# Phase 4a: reminders, in-app notifications and web push

Status: built in the `phase-4a-reminders` PR, 2026-11-20. Phase 4b (email, ntfy, Gotify, webhooks) builds on the delivery table described here.

## Scope

- Event reminders: alarms relative to an event's start ("10 minutes before", "1 day before"), up to 5 per event. They belong to the series, so every occurrence of a recurring event gets them.
- Standalone reminders: a title and a time, optionally repeating (an RRULE in a time zone), with no event.
- Delivery: a notification record per due reminder, shown in the header bell, and a web push to each browser the user subscribed.
- Actions on a notification: snooze (5, 10 or 30 minutes, 1 hour, or tomorrow at 09:00 in the user's home zone) and done.

Out of scope: reminders on tasks and routines (phases 5 and 8), other channels (4b), per-occurrence reminders.

## Data model

| Table | Columns | Notes |
| --- | --- | --- |
| `reminders` | `owner_user_id`, `event_id` (null for standalone, cascades), `minutes_before` (event), `action` (`display` or `email`, kept from the source so a round trip doesn't change it), `title`, `starts_at`, `tz`, `rrule`, `next_fire_at`, `done_at` (standalone) | A check keeps a row either an event reminder (`event_id` and `minutes_before`) or a standalone one (`title`, `starts_at`, `tz`) |
| `notifications` | `owner_user_id`, `reminder_id` (set null on delete), `event_id` (cascades), `recurrence_id`, `title`, `occurrence_start`, `all_day`, `fire_at`, `dedupe_key` (unique), `read_at`, `snoozed_until`, `done_at` | One row per fired reminder occurrence; the bell lists the open ones |
| `notification_deliveries` | `notification_id`, `channel` (`push` in 4a), `status` (`pending`, `sent`, `failed`), `attempts`, `next_attempt_at`, `last_error` | Unique per notification and channel. 4b adds its channels here |
| `push_subscriptions` | `owner_user_id`, `endpoint` (unique), `p256dh`, `auth` | One per browser. Subscribing an endpoint another account had moves it to the new account |
| `users.default_reminder_minutes` | int, null for none, default 10 | The default reminder, see below |
| `instance_settings.vapid_public_key`, `vapid_private_key` | text | Generated VAPID keys, when the environment doesn't set them |

Event reminders don't store a next fire time (the architecture's first cut said they would). Occurrences already live in `event_instances` (18 months ahead, rebuilt on every write), so the job reads due occurrences from there. Standalone reminders do keep `next_fire_at`, since they have no cache.

## Default reminder

A user setting, not per calendar: `defaultReminderMinutes`, 10 minutes before by default, or none. The web event form fills it in for new timed events; the user can remove or change it before saving. The API never adds it on its own, so imports, pulls and API clients get exactly what they send. All-day events start with no reminder.

## Delivery job

`reminders.deliver` runs every minute on pg-boss in the worker (`worker` and `all` roles):

1. **Event reminders.** Read cached occurrences that overlap the next 4 weeks and a day (the longest offset, plus slack), joined with their event's reminders, where `start - minutes` falls within a day either side of now. In TypeScript (`fireAt` in `@homa/core`) compute the exact fire time and keep the ones in `(now - 1 hour, now]`.
2. **Standalone reminders.** Claim rows with `next_fire_at <= now` (`FOR UPDATE SKIP LOCKED`), create the notification if `next_fire_at` is within the last hour, and move `next_fire_at` to the next occurrence after now (null for a one-off or the end of the rule).
3. **Snoozed notifications** whose `snoozed_until` passed come back: unread, not snoozed, with their deliveries pending again.
4. **Deliveries.** Claim pending deliveries that are due (`FOR UPDATE SKIP LOCKED`, with a 5-minute lease), send them outside the transaction, then mark them sent, or retry after 1, 2, 4 … minutes. After 8 tries a delivery is `failed`.

**Idempotency.** Notifications are inserted with `ON CONFLICT (dedupe_key) DO NOTHING`, and only rows that were inserted get deliveries. The key is `event:{event id}:{recurrence id}:{fire time}` or `standalone:{reminder id}:{fire time}`. A restart, a second worker or an overlapping run therefore can't make a second notification for the same occurrence and offset. Moving an occurrence changes its fire time, so the moved one reminds again; two reminders with the same offset make one notification. Re-pulls that replace an event's reminder rows don't matter, because the key doesn't use the reminder id.

**Time zones and DST.** Offsets that are whole days are nominal: "1 day before 09:00" fires at 09:00 the day before in the event's zone, even across a clock change. Other offsets are exact minutes. All-day events start at midnight in the user's home zone (UTC when unset), so "1 day before" an all-day event is the previous midnight there. Standalone reminders repeat in wall-clock time in their own zone, with the same expansion as events (`expand` in `@homa/core`).

**Catch-up window.** A reminder that was due while the worker was down is still sent if it is less than an hour late. Older ones are skipped, so a restart doesn't send a pile of stale alerts. A reminder added after its fire time, but less than an hour after, fires at once.

## API

- `PUT /api/events/{id}/reminders` `{ reminders: number[] }` replaces an event's reminders (minutes before; 0 to 40,320; at most 5; duplicates removed). It works on read-only calendars too (local only, see below). `POST /api/events` also accepts `reminders`. `Event` responses include `reminders`.
- `GET|POST /api/reminders`, `PATCH|DELETE /api/reminders/{id}` for standalone reminders: `{ title, at, tz, rrule }`. `GET` lists the ones not done, soonest first.
- `GET /api/notifications` answers `{ items, unread }`: open notifications (not done, not snoozed into the future), newest first, at most 50. `POST /api/notifications/read` marks them all read. `POST /api/notifications/{id}/snooze` takes `{ minutes }` or `{ until }`. `POST /api/notifications/{id}/done` marks it done; done on a one-off standalone reminder also marks the reminder done.
- `GET /api/push/key` gives the VAPID public key. `POST /api/push/subscriptions` saves a browser's `PushSubscription`, and `DELETE /api/push/subscriptions` (with the endpoint) removes it.
- `defaultReminderMinutes` joins `GET|PATCH /api/settings`.

Every route needs a session. Another user's event, reminder or notification is a 404.

## Web

- **Bell** in the header, with the unread count in its label and a badge. It opens a drawer listing open notifications, each with a snooze select and a done button. Opening it marks them read. The count polls every 30 seconds and on window focus (simpler than SSE, and works behind any proxy), and a push message also refreshes it.
- **Event form:** a "Reminders" group of toggle chips (at start, 5, 10, 15 and 30 minutes, 1 and 2 hours, 1 and 2 days, 1 week). It also shows any other offset the event already has, for example one from a sync.
- **Reminders page** (`/reminders`, linked from the bell drawer): standalone reminders with create, edit and delete, including "repeat daily, weekly, monthly or yearly".
- **Settings:** the default reminder, and web push on this browser (turn on or off, with the browser's permission prompt).
- **Service worker:** the PWA's generated worker imports `/push-sw.js`. That file shows the notification with Snooze 10 min and Done actions, calls the API for them, and opens or focuses the app on click.

Standalone reminders don't show in the calendar views in 4a. They are listed on the Reminders page, and they fire like event reminders. Showing them as agenda markers is an open question below.

## Sync mapping

| Provider | Pull | Push |
| --- | --- | --- |
| CalDAV and `.ics` import | Each `VALARM` on the series' `VEVENT` with a `TRIGGER` relative to the start (`-PT10M`, `-P1D`, `PT0S`) becomes a reminder. `ACTION:EMAIL` is kept as `email`, others as `display`. Absolute triggers, `RELATED=END` and triggers after the start are skipped | One `VALARM` per reminder (`ACTION:DISPLAY` with a `DESCRIPTION`, or `EMAIL`), on the series and on each override, so clients show them for moved occurrences too |
| Google | `reminders.overrides` (popup and email). `useDefault: true` takes the calendar's `defaultReminders` from the same `events.list` answer | `reminders: { useDefault: false, overrides }`, with `email` kept and everything else `popup`. Google allows 5, the same as Homa's limit |
| Microsoft | `isReminderOn` and `reminderMinutesBeforeStart` give one reminder, or none | The smallest offset (the one closest to the start), or `isReminderOn: false` |

**Losses.** Outlook keeps one reminder. Homa pushes only the closest one, and when the event changes on Outlook the next pull keeps only that one. CalDAV alarms Homa doesn't read (absolute, relative to the end) are dropped when Homa uploads the event, the same as attendees today. Reminders on single occurrences (Google exceptions, override `VALARM`s) aren't read. A Google event that used the calendar's defaults is written back with those defaults as explicit overrides.

**Read-only and subscribed calendars.** Pulls don't touch reminders there (ICS feeds, read-only CalDAV, Google `reader` calendars). The user's own reminders stay local and are never pushed. `.ics` imports into a native calendar read the file's alarms.

## Web push and VAPID

`HOMA_VAPID_PUBLIC_KEY` and `HOMA_VAPID_PRIVATE_KEY` (both or neither, base64url, as `web-push generate-vapid-keys` prints them) and `HOMA_VAPID_SUBJECT` (a `mailto:` or `https:` URL push services can contact; default: `HOMA_URL` when it is HTTPS, else `mailto:admin@localhost`, which Apple refuses). Without the keys, the first process that starts generates a pair and stores it in `instance_settings`. A conditional update makes sure the API and the worker can't store two different pairs. The keys aren't encrypted there: anyone who can read the database can already read every reminder. Changing the keys makes browsers subscribe again, which the web app does when it finds a stale subscription.

Sending uses `web-push` (`3.6.7`) only to sign and encrypt (`generateRequestDetails`). Homa POSTs the result itself with `fetch`, with a 10-second timeout. A 404 or 410 deletes the subscription. 429 and 5xx retry, and other refusals fail the delivery. The payload is JSON `{ id, title, startAt, allDay }`. The service worker formats the time in the browser's locale.

## Limits

| What | Limit |
| --- | --- |
| Reminders per event | 5 |
| Offset | 0 to 40,320 minutes (4 weeks) |
| Standalone reminders per user (not done) | 500 |
| Standalone title | 200 characters |
| Notifications listed | 50 newest |
| Catch-up for a late reminder | 1 hour |
| Delivery tries | 8, then failed |
| Latency | up to a minute (the job runs every minute) |

## Open questions

- Show standalone reminders as markers in the agenda and day views?
- Per-occurrence reminders (an override with its own alarms)?
- A shorter delivery delay than the 1-minute cron (pg-boss `sendAfter` per fire time) if a minute turns out to be too slow.
- Pruning: done notifications are kept. A nightly purge after 30 days is cheap to add.
