# Changelog

Changes go under `[Unreleased]`. Every release moves them into a new `## [x.y.z] - YYYY-MM-DD` section, which becomes the GitHub Release notes (see [Releasing](self-hosting/releasing.md)). Changes that need people running Homa to do something on upgrade go under `### Breaking`, with the steps to take.

## [Unreleased]

## [0.1.0] - unreleased

The first release, and the first published image: `ghcr.io/arsamsarabi/homa`, for linux/amd64 and linux/arm64, signed with cosign. Compose now pulls it instead of building from source; set `HOMA_VERSION` in `deploy/docker/.env` to pin a version (see `docs/self-hosting/operations.md`). `HOMA_IMAGE` is gone. `/api/health` reports the version.

Notification channels. Under Settings → Notification channels, people can also get reminders by email, on ntfy, on Gotify, or as a signed webhook (JSON with an `X-Homa-Signature` HMAC-SHA256 header). Each channel picks event reminders, standalone reminders or both, has a "Send test" button, and shows its last error when it keeps failing. Email needs `HOMA_SMTP_URL` and `HOMA_MAIL_FROM`, and goes only to the account's own address. ntfy, Gotify and webhook channels need `HOMA_ENCRYPTION_KEY`, and their addresses must be public https unless `HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS=true`. Migration `0011_notification_channels` adds the `notification_channels` table.

Reminders. Events can have up to five reminders ("10 minutes before", "1 day before"), for every occurrence; new timed events start with a default reminder (10 minutes, changeable in Settings, or none). Standalone reminders, optionally repeating, live on a new Reminders page. Due reminders appear in a bell in the header, with snooze (5, 10 or 30 minutes, 1 hour, tomorrow) and done, and as web push notifications in browsers that turn push on (Settings → Notifications on this device). Reminders sync as `VALARM`s with CalDAV and `.ics` files, with Google's reminders, and with Outlook (which keeps only one). Reminders on read-only calendars stay in Homa. The worker must run to send them. Web push keys are generated on first start unless `HOMA_VAPID_PUBLIC_KEY` and `HOMA_VAPID_PRIVATE_KEY` are set; set `HOMA_VAPID_SUBJECT` for Safari and iOS. Migration `0010_reminders` adds the `reminders`, `notifications`, `notification_deliveries` and `push_subscriptions` tables, `users.default_reminder_minutes` and the VAPID key columns.

Quick add: type one line such as "Dentist tue 3pm 45m", "Holiday 3-7 Dec", "Team sync every Monday 10am" or "جلسه فردا ساعت ۳ عصر" in the field under the calendar toolbar (press Q to focus it). A preview shows the date, time, length, repeat and calendar; Enter creates the event in the calendar you last created one in, and Shift+Enter (or "More options") opens the full editor filled in. English and Farsi, including Persian digits and Jalali dates like "۱۵ آذر". No migration.

Microsoft accounts (Outlook.com, Microsoft 365) can be connected and synced both ways, once the instance has its own Entra ID app: set `HOMA_MICROSOFT_CLIENT_ID` and `HOMA_MICROSOFT_CLIENT_SECRET` (see `docs/self-hosting/microsoft.md`). Without them nothing changes.

A connected calendar deleted on Google or the CalDAV server (or no longer shared with the account) no longer fails its connection's sync: Settings → Connected calendars says which one went, lists it in Choose calendars as deleted, and offers to remove it from Homa. Migration `0009_calendar_remote_missing` adds `calendars.remote_missing`.

The self-hosting guide `docs/self-hosting/docker.md` is now `docs/self-hosting/quick-start.md`, with settings in `environment.md` and reverse proxy, upgrades and backups in `operations.md`.
