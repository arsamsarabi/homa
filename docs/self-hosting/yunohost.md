# YunoHost

A YunoHost package skeleton (packaging format 2): [`deploy/templates/yunohost/`](../../deploy/templates/yunohost/). YunoHost installs apps natively rather than in Docker, so the package downloads the release source and a pinned Bun, builds the web app, uses YunoHost's PostgreSQL, and runs Homa as a systemd service behind YunoHost's NGINX on its own domain.

> A skeleton, untested on a real YunoHost server: expect to fix things on the first install. If you try it, please report back on the [QA issue](https://github.com/arsamsarabi/homa/issues?q=is%3Aissue+label%3Aqa+YunoHost).

## Try it

1. Copy `deploy/templates/yunohost/` to its own repository (YunoHost packages live in `<app>_ynh` repositories), or to a folder on the server.
2. Install it on a domain of its own (Homa doesn't run under a sub-path):

   ```sh
   sudo yunohost app install ./homa_ynh --args "domain=homa.example.com&init_main_permission=visitors"
   ```

3. Find `first-run setup code` in `/var/log/homa/homa.log`, open `https://homa.example.com` and create the admin account with that code.

## What the package does

- Generates `BETTER_AUTH_SECRET` and `HOMA_ENCRYPTION_KEY` once and keeps them in the app settings, then writes them to `homa.env` (readable only by the app user).
- Sets `HOMA_URL` to `https://<domain>` and runs one process with `HOMA_ROLE=all`. The server applies migrations when it starts, so upgrades only need the new source.
- Backs up `homa.env` and a PostgreSQL dump. The restore rebuilds from source.
- Leaves out YunoHost's SSO and LDAP: Homa has its own accounts.

## Known gaps

- YunoHost 12 (Debian 12) ships PostgreSQL 15. Homa's tests pass on 16 and 18, not yet checked on 15.
- The build needs about 1 GB of RAM.
- Homa's license (PolyForm Noncommercial) isn't a free software license, so the package can't join the official YunoHost catalog. It can still be installed from its repository URL.
- Each release needs the new tag's archive URL and `sha256` in `manifest.toml`.
