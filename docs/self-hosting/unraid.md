# Unraid

A Community Applications template for Homa: [`deploy/templates/unraid/homa.xml`](../../deploy/templates/unraid/homa.xml).

> Untested on real Unraid hardware. If you try it, please report back on the [QA issue](https://github.com/arsamsarabi/homa/issues?q=is%3Aissue+label%3Aqa+Unraid).

Unraid templates run one container, so Postgres is a separate container. Homa runs its web app and background jobs together in this one container (`HOMA_ROLE=all`).

## Install

1. Install a Postgres container (16 or newer, for example the official `postgres` image from Community Applications). Create a database and user for Homa:

   ```sh
   docker exec -it postgres psql -U postgres -c "CREATE USER homa WITH PASSWORD 'choose-a-password'" -c "CREATE DATABASE homa OWNER homa"
   ```

2. Add the template. Until it's listed in Community Applications, go to **Docker → Add Container**, and paste this into **Template** (or save the file to `/boot/config/plugins/dockerMan/templates-user/my-homa.xml` and pick it from the list):

   ```
   https://raw.githubusercontent.com/arsamsarabi/homa/main/deploy/templates/unraid/homa.xml
   ```

3. Fill in:
   - `DATABASE_URL`: `postgres://homa:choose-a-password@YOUR-SERVER-IP:5432/homa` (or the Postgres container's name if both are on a custom Docker network).
   - `BETTER_AUTH_SECRET`: the output of `openssl rand -base64 32`.
   - `HOMA_URL`: the address you open Homa at, such as `http://192.168.1.10:3000`. Sign-ins from any other address are refused.
   - `HOMA_ENCRYPTION_KEY`: another `openssl rand -base64 32`, if you'll connect Google, Microsoft, CalDAV or ICS calendars. Keep it with your backups.
4. Apply, then open the container's **Logs** and find `first-run setup code`. Open the web UI and create the admin account with that code.

The template uses the `latest` tag, so Unraid's update button moves you to each new release. Read the [changelog](../CHANGELOG.md) before updating. Back up the Postgres container's appdata; Homa keeps nothing else. See [Operations](./operations.md) for backups and upgrades.
