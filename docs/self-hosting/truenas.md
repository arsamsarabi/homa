# TrueNAS

A Docker Compose file for TrueNAS Community Edition 24.10 (Electric Eel) and later, which run apps on Docker: [`deploy/templates/truenas/docker-compose.yml`](../../deploy/templates/truenas/docker-compose.yml). It runs Homa (web app and background jobs in one container) and Postgres 18.

> Untested on real TrueNAS hardware. The same Compose file was started with Docker Compose on a Mac, the admin created, and the data survived a restart. If you try it on TrueNAS, please report back on the [QA issue](https://github.com/arsamsarabi/homa/issues?q=is%3Aissue+label%3Aqa+TrueNAS).

## Install

1. Create a dataset for the database, such as `tank/apps/homa/postgres`. Postgres sets its own ownership (UID 999) on first start.
2. Go to **Apps → Discover**, open the ⋮ menu next to **Custom App**, and pick **Install via YAML**.
3. Name the app `homa` and paste the Compose file into **Custom Config**. Before saving, change:
   - `BETTER_AUTH_SECRET`: the output of `openssl rand -base64 32`. The server won't start while it says `REPLACE_ME`.
   - `HOMA_URL`: `http://YOUR-TRUENAS-IP:30380`, or your own domain behind a reverse proxy. Sign-ins from any other address are refused.
   - the volume path, if your dataset isn't `/mnt/tank/apps/homa/postgres`;
   - `HOMA_ENCRYPTION_KEY`, if you'll connect outside calendars (`openssl rand -base64 32`; keep it with your backups);
   - optionally, the Postgres password in both `DATABASE_URL` and `POSTGRES_PASSWORD`. The database isn't published on the network.
4. Save. When the app is running, open its logs (the `homa` container) and find `first-run setup code`, then open `http://YOUR-TRUENAS-IP:30380` and create the admin account with that code.

To upgrade, edit the app's YAML and change the image tag to the new version, after reading the [changelog](../CHANGELOG.md). See [Operations](./operations.md) for backups.
