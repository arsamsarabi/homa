# Homa docs

The docs in this repository, for people running Homa and people working on it. User-facing docs are at [docs.homa.day](https://docs.homa.day).

## Self-hosting

- [Quick start](./self-hosting/quick-start.md): run Homa with Docker Compose and create the admin account.
- [Environment variables](./self-hosting/environment.md): every setting, its default, and which ones are required.
- [Operations](./self-hosting/operations.md): reverse proxy, upgrades, verifying the image, backup and restore, roles and health checks.
- [Releasing](./self-hosting/releasing.md): maintainer steps to cut a release.
- [Google Calendar](./self-hosting/google.md): creating the Google OAuth client for Google connections.
- [Microsoft](./self-hosting/microsoft.md): creating the Entra ID app for Outlook.com and Microsoft 365.

One-click templates for home-server platforms (untested on the real platforms so far):

- [Unraid](./self-hosting/unraid.md): a Community Applications template, with a separate Postgres container.
- [TrueNAS](./self-hosting/truenas.md): a Compose file for Install via YAML on 24.10 (Electric Eel) and later.
- [CasaOS](./self-hosting/casaos.md): a Compose file with CasaOS's `x-casaos` metadata.
- [Umbrel](./self-hosting/umbrel.md): an umbrelOS app package for a community app store.
- [YunoHost](./self-hosting/yunohost.md): a package skeleton that builds from source.

## Product

- [Features](./product/features.md): what Homa does today.
- [Product definition](./product/product-definition.md): what Homa is for and its full planned feature set.
- [Architecture](./product/architecture.md): stack, data model and key designs.
- [Implementation plan](./product/implementation-plan.md): delivery phases and their status.

## Design

- [Phase 4a: reminders](./design/phase-4a-reminders.md): reminders, in-app notifications and web push.
- [Phase 4c: quick add](./design/phase-4c-quick-add.md): the natural-language quick add parser and its grammar.
- [Phase 5: tasks](./design/phase-5-tasks.md): tasks, projects, tags, subtasks and their lists; task reminders, time-blocking and the Todoist import.

## Changes

- [Changelog](./CHANGELOG.md): changes, and the steps an upgrade needs.
