# Self-hosting with Docker

Homa runs as one image in two roles, plus Postgres:

| Service | What it does |
| --- | --- |
| `api` | Serves the web app and the API on port 3000, and applies database migrations when it starts |
| `worker` | Runs background jobs (sync, reminders, clean-up). Starts after `api` is healthy |
| `postgres` | Postgres 18. All data lives here |

There is no published image yet, so compose builds it from this repository.

## Start

```sh
git clone https://github.com/arsamsarabi/homa.git
cd homa
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" > deploy/docker/.env
echo "HOMA_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> deploy/docker/.env
docker compose -f deploy/docker/compose.yaml up -d --build --wait
```

Open http://localhost:3000 to set up the instance. The first account becomes the admin, and creating it needs the 4-digit setup code the API prints in its log at start:

```bash
docker compose logs api | grep 'first-run setup code'
```

Five wrong tries replace the code with a new one, also printed in the log.

## Settings

Put these in `deploy/docker/.env`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | (required) | Signs sessions. At least 32 characters; keep it secret and don't change it, or everyone is signed out |
| `HOMA_URL` | `http://localhost:3000` | The address people use to reach Homa. Sign-ins from any other origin are refused, so set it to your real address behind a reverse proxy |
| `HOMA_PORT` | `3000` | The port on the host |
| `HOMA_ENCRYPTION_KEY` | (unset) | Encrypts connected calendars' saved details (feed URLs, CalDAV app passwords, later account tokens). 32 bytes, base64: `openssl rand -base64 32`. Needed before anyone adds a connected calendar; once there are connections the server won't start without it. Back it up with the database: changing or losing it means removing and adding every connected calendar again |
| `HOMA_SYNC_INTERVAL_MINUTES` | `30` | How often each connected calendar is synced (5 to 1440). The worker checks every 5 minutes; local changes to CalDAV calendars are pushed within about a minute either way |
| `HOMA_SYNC_ALLOW_PRIVATE_NETWORKS` | `false` | Lets people subscribe to feeds and connect CalDAV servers on loopback and private networks (a Radicale or Nextcloud on your LAN). Off by default, so a feed URL can't make the server reach its own network or a cloud metadata address |
| `HOMA_AUTH_RATE_LIMIT` | `true` | Per-address limits on sign-in and sign-up attempts. Leave it on; `false` is for automated tests that sign up several accounts within seconds |
| `POSTGRES_PASSWORD` | `homa` | The database password. Set it before the first start; changing it later needs the same change inside Postgres |

## Small installs

To run the API and worker in one container, use a single service with `HOMA_ROLE=all` (the default when `HOMA_ROLE` is unset).

## Backups

Everything is in Postgres, except `HOMA_ENCRYPTION_KEY`: keep a copy of it with your backups, or connected calendars must be added again after a restore.

```sh
docker compose -f deploy/docker/compose.yaml exec postgres pg_dump -U homa homa > homa-$(date +%F).sql
```

## Upgrading

```sh
git pull
docker compose -f deploy/docker/compose.yaml up -d --build --wait
```

Migrations run when `api` starts.
