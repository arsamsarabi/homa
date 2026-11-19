# Homa

A self-hostable calendar that brings your shared calendars, tasks, reminders and routines into one place, and helps a group of people agree on a date.

Homa is in early development. See [docs/product](docs/product) for the product definition, architecture and implementation plan.

## Self-hosting

See [docs/self-hosting/docker.md](docs/self-hosting/docker.md): one `docker compose up` with the app, a background worker and Postgres.

## Development

Needs [Bun](https://bun.sh) 1.4 and a Postgres 18 database.

```sh
bun install
cp .env.example .env   # then set DATABASE_URL and BETTER_AUTH_SECRET
bun run dev        # web app on http://localhost:5173, API and worker on :3000 (/api/health, /api/openapi.json)
bun run test       # every package; set TEST_DATABASE_URL to a Postgres server to run the database tests too
bun run typecheck
bun run lint       # bun run format to fix
bun run e2e:smoke  # Playwright smoke tests against BASE_URL (default http://localhost:3000)
bun run openapi    # regenerate packages/api-client after changing API routes
cd packages/db && bun run generate <name>   # new migration after changing the schema
```

The server applies pending migrations when it starts. `HOMA_ROLE` picks what a process runs: `api` (HTTP), `worker` (background jobs) or `all` (both, the default).

## License

[PolyForm Noncommercial 1.0.0](LICENSE)
