# Operations

Running a Homa instance after the [quick start](./quick-start.md): reverse proxy, upgrades, backups, roles and health checks. Run every command from the repository root.

## Reverse proxy

Put Homa behind a reverse proxy (Caddy, nginx, Traefik) that terminates HTTPS, and send all traffic to the `api` service on port 3000. Then:

- Set `HOMA_URL` to the public address, such as `https://cal.example.com`. Homa takes its own address from `HOMA_URL`, not from `Host` or `X-Forwarded-Host`/`X-Forwarded-Proto`, so the proxy doesn't need to pass those. Sign-ins from any other origin are refused, and the Google and Microsoft redirect URIs are built from it.
- Have the proxy set `X-Forwarded-For` to the client's address, replacing any value the client sent. The sign-in and sign-up rate limits read the client address from that header, and only a single address is accepted: a chain such as `client, proxy` isn't trusted. Without a usable address all clients share one limit. Caddy's `reverse_proxy` does this by default; in nginx use `proxy_set_header X-Forwarded-For $remote_addr;`, not `$proxy_add_x_forwarded_for`.
- Don't publish port 3000 to the internet, or clients can set `X-Forwarded-For` themselves. With the proxy on the same machine, set `HOMA_PORT=127.0.0.1:3000` so Compose publishes it on loopback only.

HTTPS is also what browsers need for push notifications.

## Upgrades

Migrations apply when `api` starts, so there is no separate migration step. There is no downgrade: to go back, restore the backup you took before upgrading. Before you upgrade:

1. Read the `### Breaking` entries in the [changelog](../CHANGELOG.md) for every version since yours. They list the steps an upgrade needs.
2. Take a [backup](#backup).

Then:

```sh
git pull
docker compose -f deploy/docker/compose.yaml up -d --build --wait
```

To check that it worked, look for `migrations applied` in `docker compose -f deploy/docker/compose.yaml logs api`, and check [health](#health).

## Backup

Everything is in Postgres, except `HOMA_ENCRYPTION_KEY`: keep a copy of `deploy/docker/.env` with your backups, or connected calendars must be added again after a restore.

```sh
docker compose -f deploy/docker/compose.yaml exec -T postgres pg_dump -U homa homa > homa-$(date +%F).sql
```

The instance can keep running while the dump is taken. Each person can also export their own data as JSON in the app, but that isn't a full backup of the instance.

## Restore

Restore into the same or a newer version of Homa. Stop Homa first, so nothing writes to the database, then replace it with the dump:

```sh
docker compose -f deploy/docker/compose.yaml stop api worker
docker compose -f deploy/docker/compose.yaml exec -T postgres dropdb -U homa homa
docker compose -f deploy/docker/compose.yaml exec -T postgres createdb -U homa homa
docker compose -f deploy/docker/compose.yaml exec -T postgres psql -U homa -d homa -v ON_ERROR_STOP=1 -q < homa-2026-11-20.sql
docker compose -f deploy/docker/compose.yaml up -d --wait
```

Use the `HOMA_ENCRYPTION_KEY` the backup was made with. A dump from an older version is migrated when `api` starts.

## Roles

One image runs in any of three roles, chosen by `HOMA_ROLE`:

| Role | What it runs |
| --- | --- |
| `api` | The web app and the API. Applies migrations at start and prints the first-run setup code |
| `worker` | Background jobs: sync, reminders and clean-up. Never applies migrations, so start it after `api` |
| `all` | Both in one process. The default when `HOMA_ROLE` is unset; fine for a small install |

The Compose file runs `api` and `worker` as separate services, with `worker` starting once `api` is healthy. Run exactly one `api` (it applies migrations) and keep a `worker` or `all` running, or calendars stop syncing and reminders aren't sent.

## Health

`GET /api/health` answers `200` with `{"status":"ok","version":"…"}` while the API is up. It doesn't check the database, and `version` is `0.0.0` until `HOMA_VERSION` is set (no build sets it yet). The image's Docker health check calls it for the `api` and `all` roles; `worker` has no HTTP port and always reports healthy.

```sh
curl -fsS http://localhost:3000/api/health
docker compose -f deploy/docker/compose.yaml ps
```
