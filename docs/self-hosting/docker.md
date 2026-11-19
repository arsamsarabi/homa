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
docker compose -f deploy/docker/compose.yaml up -d --build --wait
```

Open http://localhost:3000 and create an account. The first account becomes the admin.

## Settings

Put these in `deploy/docker/.env`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | (required) | Signs sessions. At least 32 characters; keep it secret and don't change it, or everyone is signed out |
| `HOMA_URL` | `http://localhost:3000` | The address people use to reach Homa. Sign-ins from any other origin are refused, so set it to your real address behind a reverse proxy |
| `HOMA_PORT` | `3000` | The port on the host |
| `POSTGRES_PASSWORD` | `homa` | The database password. Set it before the first start; changing it later needs the same change inside Postgres |

## Small installs

To run the API and worker in one container, use a single service with `HOMA_ROLE=all` (the default when `HOMA_ROLE` is unset).

## Backups

Everything is in Postgres:

```sh
docker compose -f deploy/docker/compose.yaml exec postgres pg_dump -U homa homa > homa-$(date +%F).sql
```

## Upgrading

```sh
git pull
docker compose -f deploy/docker/compose.yaml up -d --build --wait
```

Migrations run when `api` starts.
