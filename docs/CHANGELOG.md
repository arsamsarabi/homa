# Changelog

Changes that need people running Homa to do something on upgrade go under `### Breaking` in `[Unreleased]`, with the steps to take.

## [Unreleased]

Reminders. Events can have up to five reminders ("10 minutes before", "1 day before"), for every occurrence; new timed events start with a default reminder (10 minutes, changeable in Settings, or none). Standalone reminders, optionally repeating, live on a new Reminders page. Due reminders appear in a bell in the header, with snooze (5, 10 or 30 minutes, 1 hour, tomorrow) and done, and as web push notifications in browsers that turn push on (Settings → Notifications on this device). Reminders sync as `VALARM`s with CalDAV and `.ics` files, with Google's reminders, and with Outlook (which keeps only one). Reminders on read-only calendars stay in Homa. The worker must run to send them. Web push keys are generated on first start unless `HOMA_VAPID_PUBLIC_KEY` and `HOMA_VAPID_PRIVATE_KEY` are set; set `HOMA_VAPID_SUBJECT` for Safari and iOS. Migration `0010_reminders` adds the `reminders`, `notifications`, `notification_deliveries` and `push_subscriptions` tables, `users.default_reminder_minutes` and the VAPID key columns.

Quick add: type one line such as "Dentist tue 3pm 45m", "Holiday 3-7 Dec", "Team sync every Monday 10am" or "جلسه فردا ساعت ۳ عصر" in the field under the calendar toolbar (press Q to focus it). A preview shows the date, time, length, repeat and calendar; Enter creates the event in the calendar you last created one in, and Shift+Enter (or "More options") opens the full editor filled in. English and Farsi, including Persian digits and Jalali dates like "۱۵ آذر". No migration.

Microsoft accounts (Outlook.com, Microsoft 365) can be connected and synced both ways, once the instance has its own Entra ID app: set `HOMA_MICROSOFT_CLIENT_ID` and `HOMA_MICROSOFT_CLIENT_SECRET` (see `docs/self-hosting/microsoft.md`). Without them nothing changes.

A connected calendar deleted on Google or the CalDAV server (or no longer shared with the account) no longer fails its connection's sync: Settings → Connected calendars says which one went, lists it in Choose calendars as deleted, and offers to remove it from Homa. Migration `0009_calendar_remote_missing` adds `calendars.remote_missing`.
