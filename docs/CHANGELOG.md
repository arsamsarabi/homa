# Changelog

Changes go under `[Unreleased]`. Every release moves them into a new `## [x.y.z] - YYYY-MM-DD` section, which becomes the GitHub Release notes (see [Releasing](self-hosting/releasing.md)). Changes that need people running Homa to do something on upgrade go under `### Breaking`, with the steps to take.

## [Unreleased]

Reminders, travel time and repeat share one picker. Each opens a list of presets and a row for your own value, such as "Every [3] [weeks]", "[2] [hours] before" or "[45] [minutes]" of travel, with a preview before you press **Set** or **Add**. Repeat can now be every N days, weeks, months or years, and weekly rules can pick their weekdays ("Every 2 weeks on Mon and Wed"), in the event editor, tasks and the Reminders page. Travel time takes any length up to 24 hours. Rules the picker can't build stay as they are and show as "Custom rule".

On a demo instance, the note about the shared account and nightly reset is now a centered welcome dialog when someone signs in, instead of a box in the corner of every page. It closes with **Got it**, Esc or the close button, and comes back on the next sign-in.

Sharing follow-ups. Events show who added them, as "Added by {name}" on the event block, the read-only card and the editor, when that's someone other than you (older, synced and imported events don't say). You can pick your own color for a calendar shared with you under Settings → Calendars, and only you see it. People who sign up from your invite join your "Invited" circle, which is created when needed. Migration `0020_shared_calendar_followups` adds `events.created_by_user_id` and `shared_calendar_prefs.color`; `Occurrence` gains `createdBy`.

Settings is split into tabs: **General**, **Calendars**, **Notifications**, **People**, **Security** and **Import and export**. The open tab is in the address (`/settings?tab=calendars`), so links and the Google and Microsoft connect flows land on the right one.

The Settings tabs run down the side on wider screens, and pages other than the calendar are wider. The instance settings moved from Settings to their own **Admin** page, reached from the account menu, with tabs for **General**, **Sign-ups and invites** and **Single sign-on** (`/admin?tab=…`). First-run setup has a **Back** button on the steps after the admin account is created.

Keyboard shortcut hints: the calendar toolbar shows each button's key, such as **C** beside **New event**, **T** beside **Today**, **Q** in quick add and a key for each view, plus tooltips on the arrows. Turn them off with **Show keyboard shortcut hints** in Settings → General. They don't show on touch-only devices. Migration `0021_shortcut_hints` adds `users.show_shortcut_hints` (default on), and `Settings` gains `showShortcutHints`.

Breadcrumbs replace the "Back to the calendar" link: Settings, Admin and Reminders show a trail such as **Calendar › Settings › People**, and each step but the last is a link.

Settings → Calendars is one list of cards: **Homa calendars** first, then one card per connected account or calendar link, then one per person sharing calendars with you (**Shared by {name}**), each with its calendars' colors, show or hide, and editing for your own. A single **Add calendar** button asks where the calendar is (Google Calendar, Outlook or Microsoft 365, iCloud, Fastmail, Nextcloud, another CalDAV server, a calendar link or public holidays) and opens the right form. **Choose calendars**, **Sync now** and **Remove** moved into each connection's ⋯ menu, and a failed action shows its error in that card.

The tab names down the side of Settings and Admin line up at the start instead of being centered.

The notification bell opens a panel under it (a sheet from the bottom on phones) instead of a full-height drawer. Notifications are split into **New** and **Earlier**, with an icon for an event, a task or a reminder and a time such as "Starts in 10 minutes", and the new ones keep their dot until you close the panel. Clicking one opens its day in the calendar, today's tasks or the reminders page. Each has a snooze menu and **Done** (**Complete task** for a task), and **Clear all** empties the panel without completing tasks. A reminder that fires while Homa is open also shows a toast. `POST /api/notifications/clear` is new.

Travel time on events: a timed event can have a **Travel time** before it (5 minutes to 2 hours) in the editor. The day and week views draw it as a dashed block with a car icon above the event, such as "30 min travel time", and the agenda and event details show it too. Travel time counts as busy in availability. It syncs both ways with iCloud, so travel time set in Apple Calendar shows in Homa and the other way round. On Google, Microsoft and other CalDAV servers it stays in Homa (the field says "Only in Homa, not synced"), and all-day events can't have it. Migration `0022_travel_time` adds `events.travel_minutes`; `Event`, `EventInput`, `EventPatch` and `Occurrence` gain `travelMinutes`, and `Connection` gains `syncsTravel`. Migration `0023_icloud_travel_repull` makes the next sync download iCloud events again, so events synced before this release get their travel time.

The notification panel starts with "Yesterday" and not "yesterday", and opening it no longer shows a focus ring on **Clear all**.

Moving or deleting an event right after creating it, before the save has finished, no longer fails with an error. The change waits for the new event's id.

## [0.3.0] - 2026-11-27

Settings → Security explains when adding or removing a passkey needs a recent sign-in (Better Auth's `SESSION_NOT_FRESH`), with a button to sign out and back in, instead of showing "Session is not fresh".

OIDC single sign-on and passkeys (phase 6d). Set `HOMA_OIDC_ISSUER`, `HOMA_OIDC_CLIENT_ID` and `HOMA_OIDC_CLIENT_SECRET` together (or none) for one OpenID Connect provider; optional `HOMA_OIDC_NAME` labels the sign-in button (default SSO). The redirect URI is `${HOMA_URL}/api/auth/callback/oidc`. `GET /api/instance` includes `oidc: { name, redirectUri } | null`; the admin page shows status and the URI read-only. Passkeys use `@better-auth/passkey` (no new env vars): Settings → Security lists, adds and removes them, and sign-in offers a passkey when WebAuthn is available. Migration `0019_passkeys` adds the `passkeys` table. See `docs/self-hosting/sign-in.md`.

Availability API (phase 6c). `POST /api/availability` returns permission-aware free/busy for up to 50 people over at most 92 days: the caller’s own calendars all count (hidden ones too); for anyone else only calendars at freebusy+ count, with `shared: false` when none do. Busy intervals are clipped, merged and sorted, with no titles or calendar ids; all-day events do not count. Pure helpers live in `@homa/core/availability`. Phase 7 polls will call this; no web UI here.

Sharing UI (phase 6b). The calendar filter groups shared calendars under “Shared by …”; free/busy occurrences show as Busy (striped) with a small read-only card; read opens details with the owner’s name; edit opens the editor. The event form’s calendar picker lists your calendars and those shared at edit, grouped by owner. Settings has a Sharing default (`sharingPreset`), onboarding saves the visibility choice, and each owned calendar’s drawer has a Sharing section for the default and person/circle grants.

Calendar grant checks on the API (phase 6b). `accessibleCalendars` / `calendarAccess` resolve effective access; `GET /api/calendars` returns own then shared calendars with `access` and `owner`, and a shared calendar's `hidden` is the viewer's pref. Occurrences include shared calendars at freebusy+ (titles stripped at freebusy); event read needs read+, writes need edit (same owner when moving); reminders and import stay owner-only; export stays own rows. `GET|PUT /api/calendars/{id}/grants` replaces the grant set and `defaultAccess` (owner only). Settings expose `sharingPreset`.

Calendar grants foundation (phase 6b). Migration `0018_calendar_grants` adds `calendar_grants`, `shared_calendar_prefs`, `calendars.default_access` and `users.sharing_preset` (existing accounts stay `private`). Grant resolution (`resolveAccess` in `@homa/core`) follows owner → person grant → highest circle grant → calendar default → owner preset.

Calendar UX. Work week (Mon–Fri) in the view dropdown; day and week views scroll so now sits mid-viewport; the month grid fills the available height; draft event titles update as you type and no longer shift month layout; the calendar always uses the home time zone from Settings (toolbar zone picker removed). Esc, overlay click and Close ask before discarding unsaved form edits; event reminders take an amount and unit as well as chips; saves and deletes update the UI immediately and toast on success or failure. Friendly runtime-error and 404 pages.

Invites and circles (phase 6a). Under Settings → People, an admin creates invite links: each works once, for 7 days, and can be for one address only; with email set up, Homa emails it, and signing up from the emailed link confirms the address. An invite gets past closed sign-ups, so "closed" now means invite-only. A new instance setting says whether only admins or everyone can invite (admins by default). Everyone can see the other people on the instance (`GET /api/people`) and group them into circles, which only their owner sees; circles are what calendars will be shared with in 6b. Migration `0015_people` adds the `invites`, `circles` and `circle_members` tables and `instance_settings.invites`.
One-click templates for home servers, in `deploy/templates/`: an Unraid template, a Compose file for TrueNAS 24.10 and later, a CasaOS app, an umbrelOS app package and a YunoHost package skeleton, each with a page in `docs/self-hosting/`. None has been tried on the real platform yet; the QA issues ask for help with that.
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
