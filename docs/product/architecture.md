# Homa: architecture

Status: draft, 2026-11-18. Source: architecture interview with Arsam Sarabi (tech lead).

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Bun | Fast installs, built-in test runner and TypeScript. The phase 1 spike found no blockers for the recurrence and XML libraries |
| API | Hono + `@hono/zod-openapi` | REST with an OpenAPI spec generated from zod schemas. One spec feeds the web client, the future Expo app, API-key users and MCP tools |
| DB | Postgres + Drizzle (drizzle-kit migrations) | SQL-shaped schema; raw SQL stays easy for range queries (`tstzrange`, GiST indexes) |
| Jobs | pg-boss | Postgres-backed queue and cron. No Redis, so self-host stays app + Postgres |
| Auth | Better Auth (Drizzle adapter) | Password, OIDC, passkeys, 2FA, sessions and API keys. Homa adds its own policies on top: email verification, rate limits, first user is admin |
| Search | Postgres full-text (`tsvector`, `pg_trgm`) | No extra service; Meilisearch can come later if needed |
| Web | Vite, React 19, TypeScript, TanStack Router and Query, Mantine, Zustand, `vite-plugin-pwa` | A plain SPA: the app sits behind sign-in, so it needs no server rendering. Mantine gives accessible components with RTL support, and the PWA plugin makes it installable with web push |
| Calendar views | Custom, on headless libraries | `@dnd-kit` for drag, TanStack Virtual for long ranges, Temporal polyfill for date math in the browser. No FullCalendar: its timeline views are paid |
| Recurrence | `ical.js` for parsing, expansion and serialization; `Temporal` for date math (native in Bun, polyfilled in the browser) | Chosen in the phase 1 spike (below). `rrule` was dropped |
| Tests | `bun test` (unit and integration on a throwaway Postgres) + Playwright (e2e, `@smoke` subset) | CalDAV conformance runs against a Radicale container |
| Monorepo | Bun workspaces | |
| Tooling | Biome (lint and format), TypeScript 6, `openapi-typescript` + `openapi-fetch` for the client | Biome is one fast tool for both jobs. TypeScript stays on 6.x: TypeScript 7 (the native port) has no JavaScript compiler API yet, which `openapi-typescript` needs |
| License | PolyForm Noncommercial 1.0.0 | Anyone can read, run and self-host the code; commercial hosting of it by others is not allowed |

## Repo layout

```
homa/
  apps/web/            # SPA (PWA)
  apps/server/         # Hono app: REST, CalDAV, MCP; also the worker entrypoint
  packages/core/       # domain types, recurrence, availability engine, NL quick add
  packages/db/         # Drizzle schema, migrations, repositories
  packages/sync/       # provider adapters: ics, caldav, google, microsoft
  packages/dav/        # CalDAV server (WebDAV + CalDAV handlers, XML)
  packages/notify/     # reminder channels: web push, email, ntfy, gotify, webhook
  packages/api-client/ # client generated from the OpenAPI spec (web now, Expo later)
  deploy/docker/       # Dockerfile + compose for self-hosting
  docs/                # product/, self-hosting/, guides/
```

`homa-infra` (private) holds what only the hosted instance needs: `apps/site` (Astro marketing site), `apps/docs` (docs site fed from `homa/docs`), `brand/`, `deploy/` and `docs/ops/`.

## Runtime shape

```text
Browser / PWA / CalDAV clients / MCP clients / API-key scripts
                    │
                    ▼
        homa (role=api)  ── serves SPA, /api (REST), /dav (CalDAV), /mcp
                    │
                    ├── Postgres  ◄── pg-boss queues
                    │
        homa (role=worker)
                    ├── sync: ICS, CalDAV, Google, Microsoft
                    ├── reminders: web push, SMTP, ntfy, Gotify, webhooks
                    ├── poll deadlines, tentative holds, expansion cache refresh
                    └── maintenance (token purge, account deletion)
```

One image, two roles chosen by command. Compose runs `api`, `worker` and `postgres`. A tiny install can run both roles in one container (`role=all`).

## Domain model (first cut)

All rows carry `owner_user_id` unless noted. Times are stored as `timestamptz` (UTC) plus the IANA zone they were authored in.

| Table | Notes |
| --- | --- |
| `users`, `sessions`, `accounts`, `api_keys` | Better Auth tables plus `is_admin`, `onboarding_completed`, `default_sharing_preset`, `home_tz`, `locale`, `secondary_calendar` (`jalali`) |
| `instance_settings` | Not per user: one row (a check keeps it at `id = 1`, its migration inserts it) with `instance_name`, `sign_ups` (`open`, `closed`), `default_language` (`en`, `fa`) and what new accounts start with: `default_home_tz` (null: the browser's) and `default_secondary_calendar` |
| `connections` | `provider` (`ics` now; `caldav`, `google`, `microsoft` later), `credentials` (AES-256-GCM ciphertext: the feed URL, later OAuth tokens or an app password), `status` (`pending`, `syncing`, `ok`, `error`), `last_error`, `last_synced_at` (the last attempt), `sync_started_at` (the running sync's claim) |
| `calendars` | `connection_id` null for native (deleting a connection deletes its calendars); `read_only` (subscriptions); color, `remote_id`, `sync_token` (CalDAV, Google, Graph), and for ICS feeds `remote_etag`, `remote_last_modified` and `content_hash` |
| `events` | Master record: summary, description, location, start/end, all-day, tz, `rrule`, `exdates`, `rdates`, iCalendar `uid` (unique per calendar), remote etag, `source` (`native`, `routine`, `task_block`, `poll`, `hold`) |
| `event_overrides` | Per-occurrence changes keyed by `recurrence_id` |
| `event_instances` | Expansion cache: one row per occurrence inside a rolling window (for example 18 months ahead), `tstzrange` with GiST index. Rebuilt per event on change |
| `attendees` | Per event: email or user, role, RSVP |
| `tasks`, `projects`, `tags`, `task_tags` | Tasks with optional `parent_task_id` for subtasks; `scheduled_event_id` links a time block |
| `routines`, `routine_runs` | Routine metadata; each run is a planned slot (linked event) with a done flag for streaks |
| `reminders` | Polymorphic target (`event`, `task`, `routine_run`, none), offset or absolute time, next fire time, channels |
| `notification_channels`, `push_subscriptions` | Per-user delivery config |
| `circles`, `circle_members` | Named groups of users and email-only contacts |
| `calendar_grants` | Calendar → user or circle, level `freebusy`, `read`, `edit` |
| `polls`, `poll_options`, `poll_participants`, `poll_votes` | Mode (`slots`, `ranges`, `window`), constraints JSON, deadline, quorum, required flags, guest tokens (stored hashed) |
| `booking_pages` | Slug, durations, rules, target calendar |

## Key designs

### Recurrence and the expansion cache

RRULE, RDATE, EXDATE and overrides are the source of truth, because they round-trip with CalDAV, Google and Microsoft. Every write to an event re-expands that event into `event_instances` up to about 18 months ahead (`expanded_until` on the event); the nightly `calendar.extend-horizon` job moves that window forward, and range reads past it expand the series on the fly. Expansion walks the RRULE in local wall-clock time with `ical.js` and places each occurrence in the event's zone with `Temporal`, so no `VTIMEZONE` is needed. RDATEs are stored as instants and added to the RRULE's occurrences (once each, with the series' duration); EXDATEs remove either. Series edits move the RDATEs with the series, and a "this and following" split divides them at the cut. An occurrence whose time was never changed follows the series when the series moves. Reads for views, free/busy and polls query `event_instances` by range. Edits of "this and following" split the series into two masters, as RFC 5545 clients do.

The web app shows the calendar in one zone: the user's home zone (`home_tz`, or the browser's when unset), or another picked for the view (`?tz=` in the URL). It converts each instant to "wall time" in that zone, a `Date` whose UTC fields are that zone's clock, so day and week math has no clock changes and never depends on the browser's own zone; drags and the event form convert back to instants (a skipped time moves forward by the gap, a repeated one takes the earlier, as Temporal's `compatible`). New timed events take the viewed zone; the event form can change it. With `secondary_calendar = jalali`, views add Solar Hijri dates (Intl's `persian` calendar) and Persian occasions: Nowruz, Sizdah Bedar, Chaharshanbe Suri and Yalda.

### First user and instance settings

The first account on an instance becomes its admin (`users.role = 'admin'`, set in Better Auth's user-create hook). Until it exists, `GET /api/instance` answers `needsSetup: true` and the web app sends signed-out visitors to `/setup` instead of sign-in: a stepper that creates the admin account, reviews the instance settings (name, sign-ups, default language, default home zone and second calendar), then the admin's own settings, then the calendar. Everyone after that signs up and onboards as usual.

The admin sign-up is gated by a 4-digit setup code, so whoever reaches a fresh instance first can't take it over. The API makes the code at start (when there are no users), prints it to the log (`first-run setup code: 1234`), and keeps it in memory. The setup page sends it in the `x-homa-setup-code` header with the sign-up, and the user-create hook rejects the first account without it (403). Five wrong codes replace it with a new one, printed again. `HOMA_SETUP_CODE` pins the code for automated tests. The code lives in one API process, so with several API replicas the first sign-up must reach the one whose log you read.

The admin changes the instance settings later at `/admin`, linked from Settings for admins only; `GET`/`PATCH /api/admin/instance` check the role on the server (401 signed out, 403 for non-admins). The same hook turns self sign-ups away with a 403 while `sign_ups = closed` (accounts the admin creates still work), and gives every new account the default home zone and second calendar. The web app uses `default_language` when the browser has no saved language choice; the sign-in page hides the sign-up link while sign-ups are closed.

### ICS import and JSON export

`POST /api/calendars/{id}/import` takes an `.ics` file (`text/calendar`) into one of the caller's calendars; anyone else's calendar is a 404. `@homa/core` (`src/ics/`) parses it before the transaction; then one transaction inserts or replaces each event, writes its overrides and re-expands it into `event_instances`. The response counts imported, updated and skipped events, with up to 50 warnings.

The file is treated as hostile:

| Limit | Value |
| --- | --- |
| Size | 5 MB (checked on the request body before it is read whole) |
| Components (`BEGIN:` lines) | 5,000 |
| EXDATEs and RDATEs per event | 1,000 each |
| Occurrences one import adds to the cache | 200,000; past that the whole import rolls back |
| Strings | summary 500, location 500, description 10,000 characters, UID 255; control characters are dropped |

Nothing in the file is fetched. VALARM, ATTACH and X- properties are ignored (X-LIC-LOCATION inside a VTIMEZONE is read only to name its zone). A file that isn't iCalendar, or breaks a limit, is a 400 with the reason; one unusable event is skipped with a warning.

Mapping, per VEVENT:

- SUMMARY, DESCRIPTION, LOCATION as text; DTSTART with DTEND or DURATION. An all-day event without an end lasts a day; a timed event without a length is skipped.
- `VALUE=DATE` gives an all-day event at UTC midnights with `tz = 'UTC'`.
- A DATE-TIME is read as wall-clock fields and placed with `Temporal`, never with the file's VTIMEZONE rules. Its TZID becomes an IANA zone: an IANA name (also behind a prefix such as `/mozilla.org/…/Europe/London`), a Windows name from CLDR's table (Outlook and Exchange often send no VTIMEZONE), or the X-LIC-LOCATION of the file's VTIMEZONE for that TZID. Otherwise the times are read as UTC and a warning names the TZID. `Z` times are UTC; floating times use the user's home zone (UTC when unset).
- RRULE, EXDATE and RDATE as stored. An RDATE `PERIOD` keeps only its start.
- A component with RECURRENCE-ID becomes an override in `event_overrides`, keeping only the fields that differ from the series; a cancelled one (`STATUS:CANCELLED`) becomes an EXDATE. One without its series in the file is skipped.
- The UID matches events within the calendar (`events_calendar_uid_key`), so importing the same file twice updates the events and replaces their overrides instead of adding copies. Events without a UID, with a UID used twice, or cancelled masters are skipped.

Golden fixtures in the shape of Google, Outlook and iCloud exports (`packages/core/src/ics/fixtures/`) cover DST-crossing weekly series with moved and cancelled occurrences, Windows zone names and RDATEs.

`GET /api/export` downloads everything the user owns as one JSON document (`Content-Disposition: attachment`):

```json
{
  "version": 1,
  "exportedAt": "2026-11-19T12:00:00.000Z",
  "settings": { "homeTz": "Europe/London", "secondaryCalendar": "none" },
  "calendars": [{ "id": "…", "name": "Personal", "color": "#4a4e69", "createdAt": "…", "updatedAt": "…" }],
  "events": [{ "id": "…", "calendarId": "…", "uid": "…", "summary": "…", "start": "…", "end": "…", "allDay": false,
    "tz": "Europe/London", "rrule": "FREQ=WEEKLY;BYDAY=MO", "exdates": [], "rdates": [],
    "overrides": [{ "recurrenceId": "…", "start": "…", "end": "…", "summary": null, "description": null, "location": null }] }]
}
```

Events have the same fields as `GET /api/events/{id}`. `version` goes up when a field changes meaning or goes away; added fields keep it.

### Availability engine

One function in `packages/core` answers "when is this set of people busy between A and B?". It merges each person's `event_instances` (only calendars they share at `freebusy` or higher with the asker), routine blocks they marked busy, and tentative holds. Auto-suggest, polls, the planning wizard and booking pages all call it. It returns busy intervals only, never titles, unless the grant allows details.

### Sync

Each provider implements one adapter interface in `packages/sync`: `listCalendars`, `pullChanges(calendar, since)`, `pushChange(op)`. Pulls are incremental (Google `syncToken`, Microsoft Graph delta, CalDAV `sync-collection` with ETag fallback, ICS conditional GET with a content hash). Local writes to a connected calendar go to an outbox processed by the worker, with ETag or `If-Match` conflict detection; on conflict the remote wins and the user sees a notice. The outbox arrives with CalDAV (phase 3b); ICS calendars are read-only, so phase 3a has none.

**ICS subscriptions (phase 3a).** `POST /api/connections/ics` takes a feed URL (`http`, `https`, or `webcal`, read as `https`) or a holiday catalog id. It fetches and parses the feed first, so a bad URL is a 400 and never a broken connection, then in one transaction creates the connection, one read-only calendar (named by the request, else the feed's `X-WR-CALNAME`) and its events. Renaming and recoloring use `PATCH /api/calendars/{id}`; `DELETE /api/connections/{id}` removes the connection, its calendar and the events. `DELETE /api/calendars/{id}` on a subscribed calendar is a 400.

A pull sends `If-None-Match` and `If-Modified-Since` from the last fetch. A 304, or a body whose SHA-256 matches the last one, is "unchanged": nothing is parsed or written. Otherwise the feed is parsed with the `.ics` import parser and its limits (5 MB, 5,000 components, 200,000 cached occurrences) and applied as a snapshot in one transaction: events are upserted by UID within the calendar and re-expanded, as in an import, and events whose UID is no longer in the feed are deleted. The network call never runs inside a transaction.

Read-only calendars: creating, changing, moving into, deleting or importing into one is a `ReadOnlyError` from `@homa/core`, a 403. The web app opens their events as details, without a form, doesn't drag them, and leaves them out of the calendar pickers.

**Worker.** `sync.connections` runs every 5 minutes and syncs, one at a time, up to 50 connections whose last attempt is older than `HOMA_SYNC_INTERVAL_MINUTES` (default 30). Each sync first claims its connection (`sync_started_at`; a claim older than 10 minutes is taken over), so overlapping runs and "sync now" never sync one connection twice at once. A failure sets `status = error` and `last_error` to a message safe to show, which never contains the URL, and the run goes on; the job logs counts only. "Sync now" (`POST /api/connections/{id}/sync`) runs the same sync in the API request and answers with the result, so it needs no queue in the `api` role.

**Outbound fetches (SSRF).** Feed URLs are user input fetched by the server, so `packages/sync` only allows `http` and `https` without user info, resolves the host and refuses loopback, private (RFC 1918, unique local), link-local (including `169.254.169.254` metadata), CGNAT, multicast, documentation and reserved addresses, also as IPv4-mapped IPv6; every redirect (at most 5) is checked again. Fetches time out after 30 seconds (`AbortSignal.timeout`) and stop reading past 5 MB. `HOMA_SYNC_ALLOW_PRIVATE_NETWORKS=true` lifts the address check for self-hosters with a calendar server on their own network. Known gap: the address is checked at lookup and `fetch` resolves the name again, so a DNS-rebinding server could still answer with a private address on the second lookup.

**Credentials.** A connection's secrets are stored as AES-256-GCM ciphertext (`v1.<iv>.<ciphertext and tag>`) under `HOMA_ENCRYPTION_KEY` (32 bytes, base64), with the connection id as associated data, so a ciphertext copied onto another row doesn't decrypt. ICS feed URLs count as secrets, since private links (iCloud, Google "secret address") carry a token; they are never logged or returned by the API. The key is optional until the first connection: without it, subscribing answers 503 with the reason, and a server that has connections refuses to start. Nothing is derived from `BETTER_AUTH_SECRET`, so rotating that secret doesn't lose connections. Losing or changing the key means adding each connection again (the sync reports that the key changed).

**Holiday catalog.** A small list of public-holiday feeds in `packages/sync/src/holidays/catalog.ts` (a data file, not a table): the three UK bank-holiday feeds from GOV.UK (Open Government Licence v3.0) and Iran's public holidays in English and Persian from Google Calendar's public holiday calendars (Google's terms; no open license). `GET /api/holiday-calendars` lists them; subscribing with `holidayId` uses the stored URL.

### Reminders

Each reminder stores its next fire time. A pg-boss cron job every minute claims due reminders (`FOR UPDATE SKIP LOCKED`), sends them through the user's channels, and computes the next fire time for recurring targets.

### Permissions

Every read path takes the viewer and resolves grants: owner, direct grant, circle grant, then the owner's default preset. Link guests in polls get a scoped token that can only read that poll and write their own vote.

### CalDAV server

`/dav` serves native calendars to CalDAV clients, authenticated with an app password (an API key with a `dav` scope). It needs principal discovery, `PROPFIND`, `REPORT` (`calendar-query`, `calendar-multiget`, `sync-collection`) and `PUT`/`DELETE` with ETags. Conformance is checked with real clients and against Radicale-style test suites.

### MCP

`/mcp` exposes tools generated from the same zod schemas as the REST routes (list events, find free time, create event, create task, plan routines), authenticated by API key.

## Phase 1 spike results (2026-11-19)

The tests live in `packages/core/src/spikes/` and keep running in CI, so a library upgrade that breaks one of these cases fails the build.

**Recurrence.** Test case: a weekly Monday 09:00 meeting in `Europe/London` from 16 March 2026, across the clock change on 29 March, with one occurrence cancelled (`EXDATE`) and one moved to 10:00 (`RECURRENCE-ID`).

| Library | Result |
| --- | --- |
| `ical.js` 2.2 | Correct when the feed includes its `VTIMEZONE`: the cancelled week is skipped, the moved one is at 10:00 BST, and later weeks stay at 09:00 local (08:00 UTC). **Without** a `VTIMEZONE` it treats the `TZID` as floating time and gets the clock change wrong |
| `rrule` 2.8 | Only correct when the process runs in UTC: under `TZ=Europe/London` every occurrence after the change is an hour off, under `America/New_York` four or five hours. It also only sees the `RRULE`, not the `EXDATE` or moved occurrence in other components |
| `Temporal` | Native in Bun 1.4. `ZonedDateTime` keeps 09:00 local across the change. Browsers still need the polyfill |

Decisions:

- `ical.js` parses, expands and serializes. `rrule` is not used.
- Before expanding, Homa registers a timezone for every `TZID` the feed uses but doesn't define, built from the IANA database through `Temporal`/`Intl`. Many feeds (and some CalDAV servers) omit `VTIMEZONE`, so this is required, not optional.
- The server image sets `TZ=UTC`, and nothing depends on the host's local zone.
- Golden tests from real exported calendars (Google, Outlook, iCloud, Fastmail) are added in phase 2 alongside the expansion cache.

**XML for the CalDAV server.** Clients send the same `PROPFIND` with different prefixes, or with a default namespace.

| Library | Result |
| --- | --- |
| `@xmldom/xmldom` 0.9 | Resolves namespaces: both forms give `{DAV:}displayname` and `{urn:ietf:params:xml:ns:caldav}calendar-home-set`. Builds and escapes `multistatus` responses |
| `fast-xml-parser` 5 | Either keeps the client's prefixes as part of the names, or strips them and loses the namespace. Not suitable for DAV |

Decision: `@xmldom/xmldom` for `packages/dav`.

## Self-hosting

- `docker compose up` with `homa` (api + worker) and `postgres`. Configuration through environment variables only.
- Data lives in Postgres; backup is a `pg_dump`. A JSON export lives in the app.
- Optional: SMTP, OIDC, Google and Microsoft OAuth client ids, VAPID keys for web push (generated on first start if unset).

## Risks

| Risk | Mitigation |
| --- | --- |
| Bun compatibility with XML/DAV and crypto libraries | Phase 1 spike passed for `ical.js`, `@xmldom/xmldom` and native `Temporal`; Better Auth and pg-boss already run on Bun. Fall back to Node for the server image only if a later library fails |
| Recurrence edge cases (time zones, DST, overrides) | Golden tests from real exported calendars; property tests for expansion |
| Google sensitive-scope verification for the hosted instance | Self-hosters bring their own OAuth client; start Google review early for the hosted one |
| Two-way sync conflicts and data loss | Outbox with ETags, remote-wins plus notice, never delete remote data without a matching remote state |
| Scope size | v1 hero is the calendar and sync; phases below gate the rest |
