# Operations

Running a Homa instance after the [quick start](./quick-start.md): reverse proxy, upgrades, verifying the image, backups, roles and health checks. Run every command from the repository root.

## Reverse proxy

Put Homa behind a reverse proxy (Caddy, nginx, Traefik) that terminates HTTPS, and send all traffic to the `api` service on port 3000. Then:

- Set `HOMA_URL` to the public address, such as `https://cal.example.com`. Homa takes its own address from `HOMA_URL`, not from `Host` or `X-Forwarded-Host`/`X-Forwarded-Proto`, so the proxy doesn't need to pass those. Sign-ins from any other origin are refused, and the Google and Microsoft redirect URIs are built from it.
- Have the proxy set `X-Forwarded-For` to the client's address, replacing any value the client sent. The sign-in and sign-up rate limits read the client address from that header, and only a single address is accepted: a chain such as `client, proxy` isn't trusted. Without a usable address all clients share one limit. Caddy's `reverse_proxy` does this by default; in nginx use `proxy_set_header X-Forwarded-For $remote_addr;`, not `$proxy_add_x_forwarded_for`.
- Don't publish port 3000 to the internet, or clients can set `X-Forwarded-For` themselves. With the proxy on the same machine, set `HOMA_PORT=127.0.0.1:3000` so Compose publishes it on loopback only.

HTTPS is also what browsers need for push notifications.

## Upgrades

Migrations apply when `api` starts, so there is no separate migration step. There is no downgrade: to go back, restore the backup you took before upgrading. Before you upgrade:

1. Read the `### Breaking` entries in the [changelog](../CHANGELOG.md) (or the [release notes](https://github.com/arsamsarabi/homa/releases)) for every version since yours. They list the steps an upgrade needs.
2. Take a [backup](#backup).

Then set `HOMA_VERSION` in `deploy/docker/.env` to the new version, such as `HOMA_VERSION=0.2.0`, and run:

```sh
git pull
docker compose -f deploy/docker/compose.yaml pull
docker compose -f deploy/docker/compose.yaml up -d --wait
```

`git pull` brings the Compose file up to date with the release. Pinning a version is better than following `latest`: an upgrade happens only when you choose it, after reading its breaking steps. On `latest`, the same `pull` and `up` take the newest release.

If you built the image yourself with `--build`, run `pull` before `up`, or Compose keeps using the local build.

To check that it worked, look for `migrations applied` in `docker compose -f deploy/docker/compose.yaml logs api`, and check [health](#health).

## Verify the image

Each release image is signed with [cosign](https://docs.sigstore.dev/cosign/) by the release workflow, without a long-lived key, and carries an SBOM and a provenance attestation. To check a version before you run it:

```sh
cosign verify ghcr.io/arsamsarabi/homa:0.1.0 \
  --certificate-identity-regexp '^https://github\.com/arsamsarabi/homa/\.github/workflows/release\.yml@refs/tags/v' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

It succeeds only for an image signed by `release.yml` in this repository, on a version tag. To see the SBOM: `docker buildx imagetools inspect ghcr.io/arsamsarabi/homa:0.1.0 --format '{{json .SBOM}}'`.

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

Two endpoints, for two questions:

- `GET /api/health` (liveness) answers `200` with `{"status":"ok","version":"…"}` while the API process is up. It doesn't check the database. `version` is the release the image was built for, or `0.0.0` for an image you built yourself.
- `GET /api/ready` (readiness) answers `200` with `{"status":"ready"}` only when the database answers within 2 seconds and has every migration this release ships. Otherwise it answers `503` with the reason, such as `{"status":"not-ready","reason":"the database could not be reached"}`.

The image's Docker health check calls `/api/ready` for the `api` and `all` roles, so Compose starts `worker` only once the database is migrated; `worker` has no HTTP port and always reports healthy. Point uptime monitors (Uptime Kuma, a load balancer's health check) at `/api/ready`: it catches a stopped database too, which `/api/health` doesn't.

```sh
curl -fsS http://localhost:3000/api/ready
docker compose -f deploy/docker/compose.yaml ps
```

## Accounts and passwords

With email set up (`HOMA_SMTP_URL` and `HOMA_MAIL_FROM`, see [Notifications](./notifications.md#email)):

- New accounts confirm their email address before they can sign in. The link works for 1 hour; signing in unconfirmed sends a new one, and the confirmation page can send one too. Turn this off with `HOMA_REQUIRE_EMAIL_VERIFICATION=false`. The admin account made with the setup code is confirmed when it's made.
- "Forgot password?" on the sign-in page emails a reset link that works once, for 1 hour. Setting a new password signs the account out everywhere.

Without email, the sign-in page tells people to ask the admin instead. To set a password on the server (it asks for the new one, then signs that account out everywhere):

```sh
docker compose -f deploy/docker/compose.yaml exec api bun apps/server/src/auth/set-password.ts ada@example.com
```

There's no admin page for accounts yet. To mark an address confirmed by hand, for someone whose confirmation emails don't arrive:

```sh
docker compose -f deploy/docker/compose.yaml exec postgres \
  psql -U homa -d homa -c "UPDATE users SET email_verified = true WHERE email = 'ada@example.com';"
```
