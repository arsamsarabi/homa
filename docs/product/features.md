# Homa: features

What Homa does today, on `main`. Everything here is built and released to `main`; nothing planned is listed. For the full product vision see [product-definition.md](./product-definition.md), and for how it works see [architecture.md](./architecture.md).

## Calendar

- **Views:** day, week, month, year and agenda, with drag to create, move and resize events.
- **Recurrence:** repeating events with per-occurrence changes, and "this / this and following / all" edits.
- **Time zones:** a home zone for all views, viewing in any other zone, and a time zone per event.
- **Jalali calendar:** optional Solar Hijri dates beside the Gregorian ones, with Persian occasions (Nowruz, Sizdah Bedar, Chaharshanbe Suri, Yalda).
- **Week start:** choose the first day of the week, or follow the language (Monday, or Saturday in Farsi).
- **Calendar filter and colors:** show or hide each calendar in the views, and pick a color per calendar from swatches that stay readable in both themes.
- **Quick add:** type one line such as "Dentist tue 3pm 45m", "Holiday 3-7 Dec", "Team sync every Monday 10am" or "جلسه فردا ساعت ۳ عصر" in the field under the calendar toolbar (Q focuses it). A preview shows the date, time, length, repeat and calendar; Enter creates the event, and Shift+Enter or "More options" opens the full editor filled in. Works in English and Farsi, including Persian digits and Jalali dates.

## Reminders

- **Event reminders:** up to five per event ("10 minutes before", "1 day before"), for every occurrence of a recurring event. New timed events start with a default reminder, changeable in Settings.
- **Standalone reminders:** a title and a time, optionally repeating, on the Reminders page.
- **Delivery:** due reminders appear in the bell in the header, with snooze (5, 10 or 30 minutes, 1 hour, tomorrow) and done, and as web push notifications in browsers that turn push on. Other channels (email, ntfy, Gotify, webhooks) are not built yet.
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

## Instance and self-hosting

- **Instance admin:** the first account becomes the admin, protected by a one-time setup code from the server log. The admin sets the instance name, open or closed sign-ups, the default language and the defaults for new accounts.
- **Self-hosting:** one image in two roles (API and worker) plus Postgres, with Docker Compose. Migrations run on start. See the [quick start](../self-hosting/quick-start.md).
- **API:** a REST API with a generated OpenAPI document at `/api/openapi.json`, and a typed client generated from it.
- **Security:** connected calendars' credentials are encrypted at rest, every record is scoped to its owner, sign-ins are rate limited, and feed and CalDAV URLs on private networks are refused unless allowed.

## What's next

Reminders on tasks, time-blocking, the Todoist import, sharing, group date-finding, routines and more are planned, not built. The order and status of each phase are in the [implementation plan](./implementation-plan.md).
