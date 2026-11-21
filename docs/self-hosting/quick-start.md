# Self-hosting quick start

Homa runs as one image in two roles, plus Postgres:

| Service | What it does |
| --- | --- |
| `api` | Serves the web app and the API on port 3000, and applies database migrations when it starts |
| `worker` | Runs background jobs (sync, reminders, clean-up). Starts after `api` is healthy |
| `postgres` | Postgres 18. All data lives here |

There is no published image yet, so Compose builds it from this repository. You need Docker with Compose v2 and `openssl`.

## Start

Run these from the directory you want the repository in. Every later command runs from the repository root.

```sh
git clone https://github.com/arsamsarabi/homa.git
cd homa
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" > deploy/docker/.env
echo "HOMA_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> deploy/docker/.env
docker compose -f deploy/docker/compose.yaml up -d --build --wait
```

Open http://localhost:3000 to set up the instance. The first account becomes the admin, and creating it needs the 4-digit setup code the API prints in its log at start:

```sh
docker compose -f deploy/docker/compose.yaml logs api | grep 'first-run setup code'
```

Five wrong tries replace the code with a new one, also printed in the log.

Keep `deploy/docker/.env` with your backups: losing `HOMA_ENCRYPTION_KEY` means adding every connected calendar again.

## Small installs

To run the API and worker in one container, use a single service with `HOMA_ROLE=all` (the default when `HOMA_ROLE` is unset). See [Roles](./operations.md#roles).

## Reminders and web push

Reminders show in the bell in the app's header without any setup. Push notifications (to the browser even when Homa is closed) need HTTPS: browsers only allow push on secure pages, and `http://localhost` counts as secure for trying it out. Each person turns push on per browser under Settings → Notifications on this device. On iPhone and iPad, Homa must first be added to the Home Screen. The worker sends reminders, so keep it running (`HOMA_ROLE=worker` or `all`); a reminder can be up to a minute late, and one missed by more than an hour (the worker was down) is skipped.

## Next steps

- [Environment variables](./environment.md): every setting, with its default.
- [Operations](./operations.md): reverse proxy, upgrades, backup and restore, roles and health checks.
- [Google Calendar](./google.md) and [Microsoft](./microsoft.md): letting people connect those accounts.
