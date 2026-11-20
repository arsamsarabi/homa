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
| `HOMA_ENCRYPTION_KEY` | (unset) | Encrypts connected calendars' saved details (feed URLs, CalDAV app passwords, Google and Microsoft tokens). 32 bytes, base64: `openssl rand -base64 32`. Needed before anyone adds a connected calendar; once there are connections the server won't start without it. Back it up with the database: changing or losing it means removing and adding every connected calendar again |
| `HOMA_SYNC_INTERVAL_MINUTES` | `30` | How often each connected calendar is synced (5 to 1440). The worker checks every 5 minutes; local changes to CalDAV, Google and Microsoft calendars are pushed within about a minute either way |
| `HOMA_SYNC_ALLOW_PRIVATE_NETWORKS` | `false` | Lets people subscribe to feeds and connect CalDAV servers on loopback and private networks (a Radicale or Nextcloud on your LAN). Off by default, so a feed URL can't make the server reach its own network or a cloud metadata address |
| `HOMA_VAPID_PUBLIC_KEY`, `HOMA_VAPID_PRIVATE_KEY` | (unset) | The web push keys reminders are sent with, as `bunx web-push generate-vapid-keys` prints them. Set both or neither. Without them the first process that starts generates a pair and keeps it in the database, so it survives restarts and restores. Changing them makes every browser turn push on again |
| `HOMA_VAPID_SUBJECT` | `HOMA_URL` if https, else `mailto:admin@localhost` | A `mailto:` or `https:` address push services can contact about this server. Apple's push service refuses `localhost` addresses, so set it for Safari and iOS |
| `HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS` | `false` | Lets notification endpoints (browser push services today) be on loopback and private networks. Off by default, so a user-supplied address can't make the server reach its own network or a cloud metadata address. Push works without it: browsers use public push services |
| `HOMA_GOOGLE_CLIENT_ID`, `HOMA_GOOGLE_CLIENT_SECRET` | (unset) | Your own Google OAuth client, so people can connect Google Calendar accounts. Set both or neither; without them the Google option is hidden. Needs `HOMA_ENCRYPTION_KEY` and the right `HOMA_URL`. See [Google Calendar](./google.md) |
| `HOMA_MICROSOFT_CLIENT_ID`, `HOMA_MICROSOFT_CLIENT_SECRET` | (unset) | Your own Microsoft Entra ID app, so people can connect Outlook.com and Microsoft 365 calendars. Set both or neither; without them the Outlook option is hidden. Needs `HOMA_ENCRYPTION_KEY` and the right `HOMA_URL`. The secret expires (at most 24 months): renew it before then. See [Microsoft](./microsoft.md) |
| `HOMA_AUTH_RATE_LIMIT` | `true` | Per-address limits on sign-in and sign-up attempts. Leave it on; `false` is for automated tests that sign up several accounts within seconds |
| `POSTGRES_PASSWORD` | `homa` | The database password. Set it before the first start; changing it later needs the same change inside Postgres |

## Small installs

To run the API and worker in one container, use a single service with `HOMA_ROLE=all` (the default when `HOMA_ROLE` is unset).

## Reminders and web push

Reminders show in the bell in the app's header without any setup. Push notifications (to the browser even when Homa is closed) need HTTPS: browsers only allow push on secure pages, and `http://localhost` counts as secure for trying it out. Each person turns push on per browser under Settings → Notifications on this device. On iPhone and iPad, Homa must first be added to the Home Screen. The worker sends reminders, so keep it running (`HOMA_ROLE=worker` or `all`); a reminder can be up to a minute late, and one missed by more than an hour (the worker was down) is skipped.

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
