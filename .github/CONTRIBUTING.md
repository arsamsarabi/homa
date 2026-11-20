# Contributing to Homa

Thanks for helping. Bug reports, ideas and pull requests are all welcome. Homa is early (pre-v1) and built in planned phases, so for anything larger than a fix, open an issue or a discussion first: it may already be planned in the [implementation plan](../docs/product/implementation-plan.md), or conflict with work in progress.

Looking for somewhere to start? Issues labeled [`good first issue`](https://github.com/arsamsarabi/homa/labels/good%20first%20issue) are small and self-contained, and [`help wanted`](https://github.com/arsamsarabi/homa/labels/help%20wanted) marks larger ones where help is welcome. Questions go to [Discussions](https://github.com/arsamsarabi/homa/discussions).

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security problems go through the [security policy](SECURITY.md), never a public issue.

## License of contributions

Homa is source-available under the [PolyForm Noncommercial License 1.0.0](../LICENSE). By opening a pull request you agree that your contribution is licensed under the same terms as the rest of the repository.

## Setup

You need [Bun](https://bun.sh) 1.4 and Postgres 18.

```sh
bun install
cp .env.example .env.local   # set DATABASE_URL and BETTER_AUTH_SECRET (openssl rand -base64 32)
bun run dev            # web app on http://localhost:5173; API and worker on :3000
```

The server applies migrations when it starts. On a new database, the first account becomes the admin; the setup code is in the server log.

## Before you open a pull request

`main` is protected: the "Typecheck, lint and test" and "Docker image and smoke test" checks must pass before a pull request can merge. Run the same checks locally:

```sh
bun run typecheck
bun run lint           # bun run format fixes formatting
bun run test           # with TEST_DATABASE_URL set so the database tests run
```

- `TEST_DATABASE_URL` points at a Postgres server (for example `postgres://homa:homa@localhost:5432/postgres`); each test file gets its own fresh, migrated database. Without it the database tests are skipped, so set it before you trust a green run.
- `TEST_CALDAV_URL` points at a [Radicale](https://radicale.org) server for the CalDAV conformance tests. CI's workflow ([ci.yml](workflows/ci.yml)) shows the exact container to run.
- End-to-end tests: build and start an instance, then `bun run e2e` (or `bun run e2e:smoke`) with `BASE_URL` set to it, and `HOMA_SETUP_CODE` set to its setup code when it's new. `PLAYWRIGHT_CHANNEL=chrome` uses an installed Chrome.

## How the code is organized

Read the playbook for the part you're changing. They describe the layers, naming, testing and review rules:

- [`apps/web/AGENTS.md`](../apps/web/AGENTS.md): the web app
- [`apps/server/AGENTS.md`](../apps/server/AGENTS.md): the API and the packages

The [architecture](../docs/product/architecture.md) explains the data model and the main designs (recurrence, sync, the instance admin).

## Rules that CI or review will check

- **Migrations:** change the schema in `packages/db`, then generate the migration with `cd packages/db && bun run generate <name>`. Don't hand-edit a migration that's already on `main`. Run `bun run lint` afterwards so the generated files are formatted.
- **API changes:** routes are declared with zod schemas. After changing one, run `bun run openapi` and commit `packages/api-client`; CI fails if it's out of date.
- **Changelog:** a change that needs people running Homa to do something on upgrade (a manual step, a renamed or removed setting, a breaking API change) goes under `### Breaking` in the `[Unreleased]` section of [`docs/CHANGELOG.md`](../docs/CHANGELOG.md), with the steps to take.
- **Strings:** every user-facing string goes through i18next with an English and a Farsi entry (`apps/web/src/lib/i18n/locales/`). Check that the layout works right to left.
- **Spelling:** American English in code, UI copy and docs ("color", "organize").
- **Tests:** new behavior comes with a test that fails without it.
- **UI changes:** add light and dark screenshots to the pull request.

## Pull requests

- Keep them small and about one thing. A large feature can land as several pull requests.
- Branch from `main` and give the branch a descriptive name.
- Write commit messages and the pull request description in plain sentences: what changed and why.
- Fill in the pull request template; delete checklist items that don't apply.
