# Homa: implementation plan

Status: draft, 2026-11-18. High-level phases only; each phase gets its own detailed plan before work starts. See [product-definition.md](product-definition.md) and [architecture.md](architecture.md).

Each phase ends with something usable, tests in CI, and docs updated.

## Phase 0: landing page and docs site

Lives in `homa-infra`: brand starter, landing page on `homa.day`, docs site on `docs.homa.day`, both on Cloudflare Pages with Cloudflare managed by OpenTofu. Plan: `homa-infra/docs/ops/phase-0-sites.md`.

## Phase 1: scaffolding

Status: done 2026-11-19 (pull requests #2 to #7). Spike results are in [architecture.md](./architecture.md#phase-1-spike-results-2026-11-19).

- Bun workspace with `apps/web`, `apps/server` and the `packages/*` from the architecture doc.
- Hono server with `@hono/zod-openapi`, health route, OpenAPI document, generated `api-client`.
- Drizzle + Postgres, first migration, pg-boss wired with a sample job, `role=api|worker|all`.
- Better Auth: password sign-up and sign-in, first user is admin, sessions, onboarding route stub.
- Web: Vite, React, TanStack Router and Query, Mantine, PWA manifest, i18n with English and Farsi, RTL switch, light and dark themes.
- Dockerfile and compose (api, worker, postgres). CI: typecheck, lint, `bun test`, Playwright `@smoke`, image build.
- Spikes, with results written into the architecture doc: Bun with `ical.js`/`rrule` and an XML library; DST and recurrence expansion check.

**Done when:** a fresh `docker compose up` gives a sign-in page, an empty calendar shell and a passing CI run.

## Phase 2: native calendar core

Delivered in four pull requests: 2a events, recurrence and the API; 2b the calendar views; 2c time zones and the Jalali calendar; 2d ICS import and JSON export.

Status: 2a done (#8); 2b done (#9); 2c done (#11); 2d in review.

- Calendars and events CRUD, RRULE with overrides and "this / this and following / all" edits.
- Expansion cache and range queries.
- Week, day, month, year and agenda views with drag to create, move and resize.
- Time zones, home zone, Jalali secondary calendar.
- ICS file import and JSON export.

## Phase 3: external calendars

- Connection model, encrypted credentials, sync worker and outbox.
- ICS subscriptions and the holiday catalog.
- CalDAV two-way (tested against Radicale, Nextcloud, iCloud, Fastmail).
- Google two-way, then Microsoft two-way.
- Connection status and error UI.

**Milestone: v1 hero is usable.** One timeline with every calendar, synced both ways.

## Phase 4: reminders and notifications

- Reminder model on events and standalone reminders.
- Web push, email, ntfy, Gotify and webhook channels; snooze and done.
- Natural-language quick add.

## Phase 5: tasks

- Tasks, projects, tags, subtasks; Inbox, Today and Upcoming lists.
- Reminders on tasks.
- Time-blocking onto the calendar.
- Todoist import.

## Phase 6: sharing and people

- Multi-user on one instance, invites, circles.
- Calendar grants and default sharing preset at onboarding.
- Availability engine with permission-aware free/busy.
- OIDC and passkeys.

## Phase 7: group date-finding

- Polls: slots, ranges and window modes; constraints; required and optional people; quorum.
- Link guests with scoped tokens.
- Auto-suggest from availability.
- Calendar and Gantt poll views (design exploration first).
- Tentative holds; finalize into events and `.ics` invites.

## Phase 8: routines and planning

- Routines with metadata; routine runs and streaks.
- Plan my day / week / month / year wizard on the availability engine.

## Phase 9: platform and integrations

- CalDAV server for native calendars.
- Public booking page.
- API keys and public REST docs; MCP server.
- Search across events, tasks and routines.

## Phase 10: v1 release

- Self-hosting docs, upgrade notes, backup guide.
- Hardening: rate limits, email verification, account deletion, security review.
- Marketing site and docs site in `homa-infra`; launch.

## After v1

Expo mobile app, task sync (VTODO, Google Tasks, Microsoft To Do, Todoist), hosted instance with paid plans, more languages.

## Ordering notes

- Phases 2 and 3 come first because the v1 hero is the calendar and sync.
- Phase 6 must land before phase 7: polls depend on permission-aware availability.
- The data model carries multi-user columns (`owner_user_id`, grants) from phase 1 even though sharing UI arrives in phase 6.
