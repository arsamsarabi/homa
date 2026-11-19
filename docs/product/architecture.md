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
| `connections` | Provider, encrypted credentials (OAuth tokens or app password), sync state, status, last error |
| `calendars` | `connection_id` null for native; color, visibility, remote id, sync token or ctag |
| `events` | Master record: summary, description, location, start/end, all-day, tz, `rrule`, `exdates`, `rdates`, remote uid and etag, `source` (`native`, `routine`, `task_block`, `poll`, `hold`) |
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
| `holiday_catalog` | Country → ICS URL, seeded |

## Key designs

### Recurrence and the expansion cache

RRULE, EXDATE and overrides are the source of truth (RDATE comes with ICS import in phase 2d), because they round-trip with CalDAV, Google and Microsoft. Every write to an event re-expands that event into `event_instances` up to about 18 months ahead (`expanded_until` on the event); the nightly `calendar.extend-horizon` job moves that window forward, and range reads past it expand the series on the fly. Expansion walks the RRULE in local wall-clock time with `ical.js` and places each occurrence in the event's zone with `Temporal`, so no `VTIMEZONE` is needed. An occurrence whose time was never changed follows the series when the series moves. Reads for views, free/busy and polls query `event_instances` by range. Edits of "this and following" split the series into two masters, as RFC 5545 clients do.

### Availability engine

One function in `packages/core` answers "when is this set of people busy between A and B?". It merges each person's `event_instances` (only calendars they share at `freebusy` or higher with the asker), routine blocks they marked busy, and tentative holds. Auto-suggest, polls, the planning wizard and booking pages all call it. It returns busy intervals only, never titles, unless the grant allows details.

### Sync

Each provider implements one adapter interface in `packages/sync`: `listCalendars`, `pullChanges(since)`, `pushChange(op)`. Pulls are incremental (Google `syncToken`, Microsoft Graph delta, CalDAV `sync-collection` with ETag fallback, ICS conditional GET with a content hash). Local writes to a connected calendar go to an outbox processed by the worker, with ETag or `If-Match` conflict detection; on conflict the remote wins and the user sees a notice. Provider credentials are encrypted at rest with an app key from the environment.

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
