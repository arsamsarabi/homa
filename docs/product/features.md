# Homa: features

What Homa does today, on `main`. Everything here is built and released to `main`; nothing planned is listed. For the full product vision see [product-definition.md](./product-definition.md), and for how it works see [architecture.md](./architecture.md).

## Calendar

- **Views:** day, week, work week (Mon–Fri), month, year and agenda, with drag to create, move and resize events. The view picker is a dropdown in the toolbar; day and week views scroll so the current time sits mid-viewport on load.
- **Recurrence:** repeating events with per-occurrence changes, and "this / this and following / all" edits.
- **Time zones:** a home zone under Settings for all views, and a time zone per event. The calendar always uses that home zone (there is no separate “viewing zone” in the toolbar).
- **Jalali calendar:** optional Solar Hijri dates beside the Gregorian ones, with Persian occasions (Nowruz, Sizdah Bedar, Chaharshanbe Suri, Yalda).
- **Week start:** choose the first day of the week, or follow the language (Monday, or Saturday in Farsi).
- **Calendar filter and colors:** show or hide each calendar in the views, and pick a color per calendar from swatches that stay readable in both themes.
- **Quick add:** type one line such as "Dentist tue 3pm 45m", "Holiday 3-7 Dec", "Team sync every Monday 10am" or "جلسه فردا ساعت ۳ عصر" in the field under the calendar toolbar (Q focuses it). A preview shows the date, time, length, repeat and calendar; Enter creates the event, and Shift+Enter or "More options" opens the full editor filled in. Works in English and Farsi, including Persian digits and Jalali dates.
- **Editing UX:** the draft ghost on the calendar shows the title as you type; Esc, overlay click or Close asks before discarding unsaved changes; saves and deletes update the calendar immediately and toast on success or failure.

## Reminders

- **Event reminders:** up to five per event, for every occurrence of a recurring event. Add them as chips or with an amount and unit (for example 2 weeks). New timed events start with a default reminder, changeable in Settings.
- **Standalone reminders:** a title and a time, optionally repeating, on the Reminders page.
- **Delivery:** due reminders appear in the bell in the header, with snooze (5, 10 or 30 minutes, 1 hour, tomorrow) and done, and as web push when the browser turns push on. People can also add channels under Settings → Notification channels: email, ntfy, Gotify or a signed webhook.
- **Sync:** reminders sync as `VALARM`s with CalDAV and `.ics` files, with Google's reminders, and with Outlook (which keeps only one). Reminders on read-only calendars stay in Homa.

## Tasks

- **Tasks:** a title, notes, a due date with an optional time, priority, a project, tags and one level of subtasks. A repeating task moves to its next due date when you complete it.
- **Lists:** Inbox (no project), Today (with overdue tasks), Upcoming (by day), Completed, and a list per project and per tag.
- **Reminders:** remind me before a task's due time (or before 09:00 on its due date), through the bell, push and your channels. Done on the reminder completes the task.
- **Time blocks:** put time for a task on your calendar as an event; it shows as done there once the task is.
- **Import from Todoist:** choose the CSV files Todoist exports (one per project, or all the files from a backup ZIP). Projects, subtasks, priorities, labels, notes and due dates come across; importing again adds only what is new.
- **Quick add:** type "Buy milk tomorrow" or "Call the bank mon 3pm" at the top of a list; the date and time set the due.

## Other calendars

- **Subscriptions:** read-only ICS feeds by URL, and a catalog of public-holiday feeds to subscribe to in one click.
- **Two-way sync:** CalDAV (tested with iCloud; Fastmail, Nextcloud and Radicale use the same code), Google Calendar, and Microsoft (Outlook.com and Microsoft 365). Local changes go out through an outbox; on a conflict the server's copy wins and you see a notice. A calendar deleted on the other side is flagged in Settings with an offer to remove it.
- **Import and export:** import `.ics` files from Google, Outlook, iCloud and others; export everything you own as one JSON file.

## Interface

- **Languages:** English and Farsi, with the whole interface mirrored right to left in Farsi.
- **Themes:** light and dark, following the system setting or switched by hand.
- **Installable:** a progressive web app, including on iPhone and iPad from the Home Screen.
- **Errors:** a friendly page for unexpected failures, and a 404 for unknown routes, with a way back to the calendar.

## Instance and self-hosting

- **Instance admin:** the first account becomes the admin, protected by a one-time setup code from the server log. The admin sets the instance name, open or invite-only sign-ups, who can invite people, the default language and the defaults for new accounts.
- **People:** invite links (single use, 7 days, optionally for one address and emailed when email is set up) let someone make an account even when sign-ups are closed. Everyone can see who else is on the instance and group people into private circles under Settings → People.
- **Calendar sharing:** share a calendar with a person or a circle at free/busy, details or edit; set a sharing default at onboarding and per calendar. Shared calendars appear in the filter under “Shared by …”. Free/busy shows as Busy (striped); details open read-only with the owner’s name; edit opens the editor.
- **Availability:** `POST /api/availability` returns permission-aware free/busy for a set of people over a range (no titles). Phase 7 polls will use it; there is no dedicated UI yet.
- **Sign-in:** email and password always; optional one OIDC provider from the environment; passkeys from Settings → Security. See [Sign-in](../self-hosting/sign-in.md).
- **Self-hosting:** one published image (`ghcr.io/arsamsarabi/homa`) in two roles (API and worker) plus Postgres, with Docker Compose. Migrations run on start. See the [quick start](../self-hosting/quick-start.md).
- **API:** a REST API with a generated OpenAPI document at `/api/openapi.json`, and a typed client generated from it.
- **Security:** connected calendars' credentials are encrypted at rest, every record is scoped to its owner, sign-ins are rate limited, and feed and CalDAV URLs on private networks are refused unless allowed.

## What's next

Group date-finding (polls on the availability API), routines and planning, then platform work (CalDAV server, booking pages, API keys, search). The order and status of each phase are in the [implementation plan](./implementation-plan.md).
