# Changelog

Changes go under `[Unreleased]`. Every release moves them into a new `## [x.y.z] - YYYY-MM-DD` section, which becomes the GitHub Release notes (see [Releasing](self-hosting/releasing.md)). Changes that need people running Homa to do something on upgrade go under `### Breaking`, with the steps to take.

## [Unreleased]

Demo mode for a public demo instance. With `HOMA_DEMO=true` the server seeds a shared demo account with made-up calendars, recurring events, tasks, projects and reminders around today (a few in Farsi), fills in its sign-in on the sign-in page, and shows a note on every page that the demo resets every night. Sign-up, account changes, connected calendars, notification channels, web push and instance settings answer `403`, and the server won't start in demo mode with email or Google or Microsoft set up. `bun apps/server/src/demo-reset.ts` wipes every account and seeds again, for a nightly job. `GET /api/instance` has a new `demo` field (null except on a demo). See `docs/self-hosting/demo.md`. No migration.

## [0.2.0] - 2026-11-22

Email confirmation and password reset. On a server with email set up (`HOMA_SMTP_URL` and `HOMA_MAIL_FROM`), new accounts confirm their address from a link before they can sign in, and "Forgot password?" on the sign-in page emails a reset link that works once, for 1 hour. Both emails are in English or Farsi. `HOMA_REQUIRE_EMAIL_VERIFICATION=false` turns confirmation off; `true` without email stops the server at startup. Without email, the sign-in page says to ask the admin, who can set a password with `bun apps/server/src/auth/set-password.ts <email>` in the `api` container. Migration `0014_verify_existing_users` marks every existing account confirmed.

`GET /api/ready` answers `200` only when the database answers and its migrations are applied, and `503` with the reason otherwise. The image's health check now uses it; point uptime monitors at it. `/api/health` stays a liveness check.

Reminder emails now use the same branded layout as the account emails, in English or Farsi, light or dark. The button opens the event's day in the calendar, the Tasks page or the Reminders page, and a note says how to change email reminders under Settings → Notification channels. The plain-text part stays, with the same link.

The CalDAV account drawer has presets for mailbox.org, Posteo and Zoho Calendar, each with its server address and an app password hint, and the calendar filter names those accounts after their service. Thanks to @nguyenmaimyan for the first outside contribution (#62).

Sign-up refused because sign-ups are closed or the setup code is wrong now answers `400` instead of `403`, with the same message.

Upgrading: nothing to do. Existing accounts stay confirmed and nobody is signed out. With email set up, people who sign up from now on must confirm their address first.

## [0.1.0] - 2026-11-22

The first release, and the first published image: `ghcr.io/arsamsarabi/homa`, for linux/amd64 and linux/arm64, signed with cosign. Compose now pulls it instead of building from source; set `HOMA_VERSION` in `deploy/docker/.env` to pin a version (see `docs/self-hosting/operations.md`). `HOMA_IMAGE` is gone. `/api/health` reports the version.

Notification channels. Under Settings → Notification channels, people can also get reminders by email, on ntfy, on Gotify, or as a signed webhook (JSON with an `X-Homa-Signature` HMAC-SHA256 header). Each channel picks event reminders, standalone reminders or both, has a "Send test" button, and shows its last error when it keeps failing. Email needs `HOMA_SMTP_URL` and `HOMA_MAIL_FROM`, and goes only to the account's own address. ntfy, Gotify and webhook channels need `HOMA_ENCRYPTION_KEY`, and their addresses must be public https unless `HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS=true`. Migration `0011_notification_channels` adds the `notification_channels` table.

Reminders. Events can have up to five reminders ("10 minutes before", "1 day before"), for every occurrence; new timed events start with a default reminder (10 minutes, changeable in Settings, or none). Standalone reminders, optionally repeating, live on a new Reminders page. Due reminders appear in a bell in the header, with snooze (5, 10 or 30 minutes, 1 hour, tomorrow) and done, and as web push notifications in browsers that turn push on (Settings → Notifications on this device). Reminders sync as `VALARM`s with CalDAV and `.ics` files, with Google's reminders, and with Outlook (which keeps only one). Reminders on read-only calendars stay in Homa. The worker must run to send them. Web push keys are generated on first start unless `HOMA_VAPID_PUBLIC_KEY` and `HOMA_VAPID_PRIVATE_KEY` are set; set `HOMA_VAPID_SUBJECT` for Safari and iOS. Migration `0010_reminders` adds the `reminders`, `notifications`, `notification_deliveries` and `push_subscriptions` tables, `users.default_reminder_minutes` and the VAPID key columns.

Quick add: type one line such as "Dentist tue 3pm 45m", "Holiday 3-7 Dec", "Team sync every Monday 10am" or "جلسه فردا ساعت ۳ عصر" in the field under the calendar toolbar (press Q to focus it). A preview shows the date, time, length, repeat and calendar; Enter creates the event in the calendar you last created one in, and Shift+Enter (or "More options") opens the full editor filled in. English and Farsi, including Persian digits and Jalali dates like "۱۵ آذر". No migration.

Microsoft accounts (Outlook.com, Microsoft 365) can be connected and synced both ways, once the instance has its own Entra ID app: set `HOMA_MICROSOFT_CLIENT_ID` and `HOMA_MICROSOFT_CLIENT_SECRET` (see `docs/self-hosting/microsoft.md`). Without them nothing changes.

A connected calendar deleted on Google or the CalDAV server (or no longer shared with the account) no longer fails its connection's sync: Settings → Connected calendars says which one went, lists it in Choose calendars as deleted, and offers to remove it from Homa. Migration `0009_calendar_remote_missing` adds `calendars.remote_missing`.

The self-hosting guide `docs/self-hosting/docker.md` is now `docs/self-hosting/quick-start.md`, with settings in `environment.md` and reverse proxy, upgrades and backups in `operations.md`.

Task reminders and time blocks. A task with a due date can have reminders (minutes before its due time, or before 09:00 on a date-only due); they arrive in the bell, by push and through channels, and Done on one completes the task. Channels get a third kind, task reminders, which existing channels that take standalone reminders get automatically. The task drawer can block time for the task on a calendar: an ordinary event linked to the task, struck through once the task is done. Migration `0013_task_reminders_and_blocks` adds `reminders.task_id`, `notifications.task_id` and `tasks.scheduled_event_id`.

Import from Todoist. Settings → Import from Todoist takes the CSV files Todoist exports per project (or every file from a Pro backup ZIP): each becomes a project, with subtasks, priorities, labels as tags, descriptions and comments as notes, and due dates read like quick add. A date it can't read is kept in the notes. Importing again adds only what is new. No migration.

Tasks. A Tasks page (the checklist icon in the header) has an Inbox, Today (with overdue tasks), Upcoming, Completed, and a list per project and per tag. Tasks have notes, a due date with an optional time, priority, tags and one level of subtasks; a repeating task moves to its next due date when completed. The field at the top of each list reads dates like the calendar's quick add ("Buy milk tomorrow"). Tasks, projects and tags are in the JSON export. Migration `0012_tasks` adds the `projects`, `tags`, `tasks` and `task_tags` tables.
