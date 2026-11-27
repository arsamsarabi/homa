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

Status: done (2a #8, 2b #9, 2c #11, 2d #14).

- Calendars and events CRUD, RRULE with overrides and "this / this and following / all" edits.
- Expansion cache and range queries.
- Week, day, month, year and agenda views with drag to create, move and resize.
- Time zones, home zone, Jalali secondary calendar.
- ICS file import and JSON export.

## Phase 3: external calendars

Delivered in four pull requests: 3a the connection model, encrypted credentials, the sync worker, ICS subscriptions, the holiday catalog and the connection status UI; 3b CalDAV two-way with the outbox; 3c Google; 3d Microsoft.

Status: done. 3a (#16), 3b (#19), 3c (#20), 3d (#28).

- Connection model, encrypted credentials, sync worker and outbox.
- ICS subscriptions and the holiday catalog.
- CalDAV two-way (tested against Radicale, Nextcloud, iCloud, Fastmail).
- Google two-way, then Microsoft two-way.
- Connection status and error UI.
- Calendar filter (show or hide each calendar in the views) and a color for every calendar in Settings.

Phase 3 is done. On 2026-11-20 it passed hand tests against real iCloud (CalDAV), Google and Microsoft accounts. Fastmail and Nextcloud weren't tested with real accounts; they use the same CalDAV code, which CI tests against Radicale.

**Milestone: v1 hero is usable.** One timeline with every calendar, synced both ways.

## Phase 4: reminders and notifications

Status: done. 4a (#44), 4b (#48), 4c (#40).

- Reminder model on events and standalone reminders.
- Web push, email, ntfy, Gotify and webhook channels; snooze and done.
- Natural-language quick add.

## Releases and distribution

Comes right after phase 4, before phase 5. Everything that makes Homa easy to install and to trust, so people outside the project can run it.

- Versioned releases: semver tags from `v0.1.0`, GitHub Releases with notes taken from a per-version `CHANGELOG`, and a short upgrade note when a release has breaking steps.
- A published Docker image on GHCR (`ghcr.io/arsamsarabi/homa`), multi-arch (amd64 and arm64), tagged by version and `latest`, built and pushed from the release workflow. Compose files and docs switch from building locally to pulling it.
- Supply chain: images signed with cosign (keyless), an SBOM and provenance attestation attached to each release.
- One-click templates for home-server platforms: Unraid, TrueNAS, CasaOS, Umbrel and YunoHost.
- A public demo instance with made-up data that resets every night.
- A short demo video for the README. Done (#47).

Status: the release workflow, the GHCR image and its signing are built (#50). Releases v0.1.0, v0.2.0 and v0.3.0 are published. One-click templates for Unraid, TrueNAS, CasaOS, Umbrel and YunoHost are in `deploy/templates/` (#87), untested on the real platforms (QA #88 to #92). Demo mode, its seed and nightly reset are built (#86); hosting `demo.homa.day` is configured in the infra repo.

## Phase 5: tasks

Status: done. 5a (#51), 5b (#52), 5c (#53).

- Tasks, projects, tags, subtasks; Inbox, Today and Upcoming lists.
- Reminders on tasks.
- Time-blocking onto the calendar.
- Todoist import.

## Phase 6: sharing and people

Status: done. Designed in [phase-6-sharing.md](../design/phase-6-sharing.md). 6a (#93), 6b (#108–#110), 6c (#111), 6d (#112).

- Multi-user invites, people directory and circles.
- Calendar grants, sharing preset, grant checks on every path, and sharing UI in the views and Settings.
- Availability API (permission-aware free/busy).
- OIDC single sign-on (one provider from the environment) and passkeys.

## Feature requests backlog (triaged 2026-11-27)

Open requests from QA and Arsam's Homa notes, grouped and ordered. Size: S is about a day, M is a few days, L needs a design first.

### 1. Sharing follow-ups (next: 0.3.1)

Status: done (#125). These finish phase 6, so they came first.

- **Show who created an event on shared calendars.** Shared events name their creator in the views and the event card. Needs a creator column on events. Size M.
- **Your own color for a shared calendar.** Each person picks a color for a calendar shared with them, saved only for them, next to the per-person hide setting. Size S.
- **Invited people join an "Invited" circle.** Accepting an invite adds the person to a default circle that belongs to whoever invited them, so it's ready for sharing. Size S.

### 2. App UX polish (0.3.x)

- **Tabbed Settings page.** Done (#126): General, Calendars, Notifications, People, Security, and Import and export, with the open tab in the URL (`?tab=`). Tabs run vertically on wider screens, and the instance settings moved to a tabbed Admin page in the account menu.
- **Onboarding back buttons.** Done: first-run setup has Back on the Personal and Done steps (not back to the admin account, which already exists). User onboarding is a single page, so it needs none.
- **Keyboard shortcut hints.** Done: key caps on the calendar toolbar, quick add and view menu, and arrow tooltips. "Show keyboard shortcut hints" in Settings → General is on by default, and hints are hidden on touch-only devices.
- **Breadcrumbs.** Add breadcrumbs on nested screens, such as Settings → Calendars → one calendar. Do this after the Settings tabs. Size S.
- **Tidier calendar connection flow.** Rework adding and fixing a connection (CalDAV, Google, Microsoft, ICS) into one clear flow. Audit it first. Size M.
- **Notifications and panel redesign.** Redesign the notification panel and how notifications look. Size M, design first.

### 3. Calendar features (0.4)

- **Travel time on events.** An optional travel time before an event, as in Apple Calendar: a block above the event with a car icon and "1 hr travel time". It counts as busy for availability and in polls. It doesn't sync to Google or CalDAV yet, since neither has a standard field for it. Size M.

### 4. Scheduling (with phase 7)

- **Subscribe to a person's availability.** A wishlist item to explore: following someone's free/busy as a calendar overlay, or as an ICS feed for other apps. Builds on the availability API (6c) and their grants. Explore it alongside phase 7. Size L.

### Done from the same lists

Resizing events, the toolbar and date navigator redesign, editing an event moving it live, the custom reminder repeat, Esc and dirty-form guards, optimistic saves with toasts, the Work week view, and one scrollbar in the calendar.

## Phase 7: group date-finding

- Subscribe to a person's availability (see the backlog above), explored here.
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
- The data model carried multi-user columns (`owner_user_id`, grants) from phase 1; phase 6 filled in grants, the sharing UI, availability and OIDC/passkeys.
