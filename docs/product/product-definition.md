# Homa: product definition

Status: draft, 2026-11-18. Source: product owner interview with Arsam Sarabi.

## What Homa is

Homa is a self-hostable calendar. It holds its own calendars and also pulls in the calendars people already use (Google, Microsoft, iCloud and any CalDAV server or ICS feed), so everything sits on one timeline. On top of the calendar it adds reminders, a basic task manager, routines, and a way for a group of people to find and agree on a date or date range.

The name comes from the Homa (Huma), the bird of fortune in Persian myth whose shadow brings luck. It is also the name of the founder's grandmother.

[Mitra](https://github.com/a11delavar/mitra) is the closest existing app and the reference point. Homa differs in four ways:

1. Reminders are first class: an alert on any item, plus quick standalone reminders.
2. A real task manager: tasks, projects and tags.
3. Routines are their own entity, separate from events, and drive planning.
4. Group date-finding is built in and uses what Homa already knows about everyone's availability.

## Who it is for

| Stage | Primary user |
| --- | --- |
| Launch | A self-hoster running one instance for themselves, with friends and family invited by link |
| Later | Households and friend groups on one instance, small teams, and people on a hosted instance |

The launch audience is narrow, but nothing in the design may assume a single user. Multi-user, sharing and permissions are part of the model from the first migration.

## Delivery model

Same as Linkdean:

- `homa` (this repo): the app. Source-available under PolyForm Noncommercial 1.0.0, self-hostable with Docker Compose.
- `homa-infra` (private): the hosted instance, marketing site, docs site, brand kit and operator docs.
- Domain `homa.day`: landing page on the apex and `www`, docs on `docs.homa.day`, the hosted app on `app.homa.day`.
- Self-hosting is free. A paid hosted instance may follow later; billing is not in v1.

## v1 hero

**A unified calendar with reliable sync.** At launch Homa must be a calendar you can trust with all your calendars: correct recurrence, time zones and two-way sync. Tasks, routines, reminders and group polls ship in v1 but are judged against that bar, not ahead of it.

## Core concepts

| Concept | What it is |
| --- | --- |
| **Calendar** | A container of events. Native (stored in Homa) or connected (mirrors an external source). |
| **Connection** | A link to an external account or feed: ICS (read-only), CalDAV, Google or Microsoft (two-way). |
| **Event** | A timed or all-day item with optional recurrence (RFC 5545 RRULE), attendees, location and reminders. |
| **Task** | A to-do with optional due date, project, tags, subtasks and reminders. Can be time-blocked onto the calendar. |
| **Project** | A group of tasks. |
| **Tag** | A per-user label on tasks (and later events). |
| **Reminder** | An alert attached to an event, task or routine occurrence, or a standalone quick reminder ("call mum at 5pm"). |
| **Routine** | A habit-like activity with metadata (duration, frequency, preferred time of day, participants). Homa-only: it is never written to external calendars as a routine. |
| **Circle** | A named group of people (Family, Friends, Book club) used for sharing rules and poll invites. |
| **Poll** | A group date-finding session with candidate dates, ranges or a window, participants and a deadline. |
| **Availability** | Free/busy derived from all of a user's calendars, routine blocks and tentative holds. |

## Features

### 1. Calendar

- Day, week, month, year and timeline (agenda) views. Drag to create, move and resize.
- Native calendars and connected calendars side by side, each with color and visibility toggles.
- Recurrence per RFC 5545: RRULE, EXDATE, RDATE and per-occurrence overrides, editable as "this", "this and following" or "all".
- Time zones are first class: events store their IANA zone; the user can set a home zone and view in another.
- Jalali (Solar Hijri) calendar shown alongside Gregorian, with Persian occasions (Nowruz, Yalda, Chaharshanbe Suri).
- Holiday catalog: one-click subscribe to public holiday feeds per country (Iran and UK first).
- Natural-language quick add: "dinner with Sara fri 7pm" creates an event, "buy milk tmrw" creates a reminder.
- Search across events, tasks and routines (Postgres full-text).

### 2. External calendars

| Source | v1 | Direction |
| --- | --- | --- |
| ICS / webcal feed | yes | read-only subscription |
| CalDAV (iCloud, Fastmail, Nextcloud, Yahoo, Zoho, Posteo, mailbox.org, Radicale) | yes | two-way |
| Google Calendar | yes | two-way (OAuth) |
| Microsoft 365 / Outlook.com | yes | two-way (Microsoft Graph) |
| Proton Calendar | via ICS share link | read-only (Proton has no public API) |
| Exchange on-prem (EWS) | no | being retired by Microsoft |

Sync is incremental (Google sync tokens, Graph delta, CalDAV sync-collection and ETags), resilient to provider outages, and shows a clear per-connection status and last error.

### 3. Homa as a CalDAV server

Homa exposes its native calendars (and later tasks as VTODO) over CalDAV, so phone and desktop calendar apps can sync with it directly. This is the bridge until the mobile app exists.

### 4. Tasks

- Tasks with title, notes, due date or due time, priority, project, tags and subtasks.
- Inbox, Today, Upcoming, per-project and per-tag lists.
- Time-blocking: drag a task onto the calendar to create a linked block; completing the task marks the block done.
- Unscheduled tasks feed the planning wizard.

### 5. Reminders

- One reminder model that attaches to anything: event, task, routine occurrence, or nothing (standalone).
- Multiple reminders per item, relative ("15 min before") or absolute.
- Delivery channels in v1: web push (installed PWA), email, and ntfy / Gotify / generic webhook.
- Snooze and mark done from the notification where the channel allows it.

### 6. Routines and planning

- A routine records what it is and how it usually happens: duration, frequency target ("3 times a week"), preferred time of day, days, participants and notes.
- **Plan my day / week / month / year:** the user picks routines and unscheduled tasks; Homa proposes slots from free time using the availability engine; the user adjusts and confirms. Confirmed slots become Homa events linked to the routine.
- Completion tracking: planned versus done per routine, with streaks and simple stats.
- Routines stay Homa-only. Their planned slots can appear on connected calendars as ordinary busy events if the user chooses, but the routine itself is never retrofitted into an external event type.

### 7. Group date-finding (polls)

The feature that ties Homa together. An organizer asks a group "when can we all do this?".

**Participants**

- Homa users on the instance. Their availability fills in automatically, according to what they share.
- Guests with a link. They vote with just a name, no account.
- Each participant is required or optional, and the organizer can set a quorum ("need 4 of 6").

**What the organizer can propose**

| Mode | Example |
| --- | --- |
| Candidate slots | Dinner: Fri 7pm or Sat 8pm |
| Date ranges | Trip: any 4 nights between 1 and 31 August |
| Open window | "Sometime in March": everyone paints when they are free |
| Auto-suggest | Homa ranks the best slots from members' free/busy before anyone votes |

Range constraints cover trips: minimum and maximum nights, allowed start weekdays, "must include a weekend".

**Lifecycle**

Draft → open → deadline reached or closed early → finalized. Finalizing creates the event on every member's calendar and sends an `.ics` invite email to link guests. While a poll is open, candidate slots can appear as tentative holds on the organizer's calendar (and optionally on members'), so nobody double-books them.

**Views (open for design exploration)**

- A full-page calendar view for picking and comparing dates.
- A Gantt-style view: one row per person, their availability and chosen dates or ranges across the timeline, with the overlap highlighted.

### 8. Sharing and permissions

- A proper permission model: owner, and grants of `free/busy`, `read details` or `edit` on a calendar, to a person or a circle.
- At first sign-in the user picks a default sharing preset: **Private**, **Free/busy** or **Details**. They can override it per calendar, per circle and per person later.
- Polls and auto-suggest only use what each person has shared.
- Public booking page (Cal.com style): a link where others can book time with you, driven by availability. Free, no payments.

### 9. Integrations and API

- REST API with an OpenAPI spec, authenticated by per-account API keys (like Linkdean).
- MCP server so AI assistants (Claude and others) can read and plan the user's calendar, tasks and routines.
- Imports: ICS files, Todoist, and a Mitra-compatible import where feasible. Full JSON export for backup and migration.

### 10. Platform

- Responsive web app, installable as a PWA. A React Native (Expo) mobile app comes after v1.
- Internationalization and right-to-left layout from day one; English and Farsi first.
- Light and dark themes. No telemetry.
- Accounts: email and password, OIDC single sign-on, passkeys. First user becomes admin.

## Later (post-v1)

- Native mobile app (Expo).
- Task sync with CalDAV VTODO, Google Tasks, Microsoft To Do and Todoist.
- Hosted instance with paid plans.
- Further languages and holiday catalogs.

## Non-goals for v1

- Native mobile apps.
- Video meeting links (Zoom, Meet, Teams) generated by Homa.
- Payments on the booking page.
- Team and enterprise administration (org policies, SCIM, audit exports).

## Open questions

1. Poll UI: which of the calendar and Gantt views is the default, and how they switch. To be settled in design.
2. Mitra import: depends on Mitra's export format; check before promising it.
3. Google OAuth app verification for hosted use: required scopes for two-way calendar access are sensitive and need Google review.
