# Environment variables

Homa is configured with environment variables only. With Docker Compose, put them in `deploy/docker/.env`; in development, put them in `.env.local` at the repository root (start from [`.env.example`](../../.env.example)). The server checks every value when it starts and refuses to start with a list of what is wrong.

**Required** marks a variable the server won't start without. An empty value counts as unset.

## Core

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | Set by Compose | **Required.** The Postgres connection string. Compose builds it from `POSTGRES_PASSWORD`; set it yourself only when you run the server without Compose |
| `HOMA_URL` | `http://localhost:3000` | The address people use to reach Homa. Sign-ins from any other origin are refused, and the Google and Microsoft redirect URIs are built from it, so set it to your real address behind a reverse proxy. See [Reverse proxy](./operations.md#reverse-proxy) |
| `HOMA_ROLE` | `all` | `api` (HTTP only), `worker` (background jobs only) or `all` (both in one process). Compose runs one service per role. See [Roles](./operations.md#roles) |
| `PORT` | `3000` | The port the server listens on inside the container |
| `HOMA_VERSION` | Set in the image | The version reported by `/api/health` and the OpenAPI document. Release images set it to their version; images you build yourself and development report `0.0.0` |
| `HOMA_WEB_DIR` | Set in the image | The built web app to serve, relative to the working directory. Unset in development, where Vite serves it |

## Auth

| Variable | Default | Meaning |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | (none) | **Required.** Signs sessions and tokens. At least 32 characters (`openssl rand -base64 32`). Keep it secret and don't change it, or everyone is signed out |
| `HOMA_AUTH_RATE_LIMIT` | `true` | Per-address limits on sign-in and sign-up attempts. Leave it on; `false` is for automated tests that sign up several accounts within seconds |
| `HOMA_SETUP_CODE` | Random | Pins the 4-digit first-run setup code instead of a random one printed in the log. For automated tests only; leave it unset in production |

## Sync and connected calendars

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOMA_ENCRYPTION_KEY` | (unset) | **Required once anyone adds a connected calendar.** Encrypts connected calendars' saved details (feed URLs, CalDAV app passwords, Google and Microsoft tokens) at rest. 32 bytes, base64: `openssl rand -base64 32`. Once there are connections the server won't start without it. Back it up with the database: changing or losing it means removing and adding every connected calendar again |
| `HOMA_SYNC_INTERVAL_MINUTES` | `30` | How often each connected calendar is synced, 5 to 1440. The worker checks every 5 minutes; local changes to CalDAV, Google and Microsoft calendars are pushed within about a minute either way |
| `HOMA_SYNC_ALLOW_PRIVATE_NETWORKS` | `false` | Lets people subscribe to feeds and connect CalDAV servers on loopback and private networks (a Radicale or Nextcloud on your LAN). Off by default, so a feed URL can't make the server reach its own network or a cloud metadata address |

## Google

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOMA_GOOGLE_CLIENT_ID`, `HOMA_GOOGLE_CLIENT_SECRET` | (unset) | Your own Google OAuth client, so people can connect Google Calendar accounts. Set both or neither; without them the Google option is hidden. Needs `HOMA_ENCRYPTION_KEY`, and the client's redirect URI must be `${HOMA_URL}/api/connections/google/callback`. See [Google Calendar](./google.md) |

## Microsoft

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOMA_MICROSOFT_CLIENT_ID`, `HOMA_MICROSOFT_CLIENT_SECRET` | (unset) | Your own Microsoft Entra ID app, so people can connect Outlook.com and Microsoft 365 calendars. Set both or neither; without them the Outlook option is hidden. Needs `HOMA_ENCRYPTION_KEY`, and the app's redirect URI must be `${HOMA_URL}/api/connections/microsoft/callback`. The secret expires (at most 24 months): renew it before then. See [Microsoft](./microsoft.md) |

## Reminders and web push

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOMA_VAPID_PUBLIC_KEY`, `HOMA_VAPID_PRIVATE_KEY` | (unset) | The web push keys reminders are sent with, as `bunx web-push generate-vapid-keys` prints them. Set both or neither. Without them the first process that starts generates a pair and keeps it in the database, so it survives restarts and restores. Changing them makes every browser turn push on again |
| `HOMA_VAPID_SUBJECT` | `HOMA_URL` if https, else `mailto:admin@localhost` | A `mailto:` or `https:` address push services can contact about this server. Apple's push service refuses `localhost` addresses, so set it for Safari and iOS |
| `HOMA_NOTIFY_ALLOW_PRIVATE_NETWORKS` | `false` | Lets notification addresses (browser push services, and people's ntfy, Gotify and webhook channels) be plain `http` and on loopback, private and link-local networks, for an ntfy or Gotify on your LAN. Off by default, so a user-supplied address can't make the server reach its own network or a cloud metadata address. Push and public ntfy work without it |
| `HOMA_SMTP_URL`, `HOMA_MAIL_FROM` | (unset) | The SMTP server email reminders go through (`smtp://user:pass@host:587` with STARTTLS, or `smtps://user:pass@host:465`) and the sender (`Homa <homa@example.com>`). Set both or neither; without them email isn't offered. See [Notifications](./notifications.md) |

## Quick add

Quick add has no settings: the parser runs in the browser.

## Docker Compose only

These are read by [`deploy/docker/compose.yaml`](../../deploy/docker/compose.yaml), not by the server.

| Variable | Default | Meaning |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `homa` | The database password. Set it before the first start; changing it later needs the same change inside Postgres |
| `HOMA_PORT` | `3000` | The port published on the host. `127.0.0.1:3000` publishes it on loopback only, for a reverse proxy on the same machine |
| `HOMA_VERSION` | `latest` | The release of `ghcr.io/arsamsarabi/homa` to pull and run, such as `0.1.0`. Pin one; see [Upgrades](./operations.md#upgrades). The container reports the version baked into its image, not this value |
