# CasaOS

A CasaOS app (Docker Compose with an `x-casaos` block): [`deploy/templates/casaos/docker-compose.yml`](../../deploy/templates/casaos/docker-compose.yml). It runs Homa (web app and background jobs in one container) and Postgres 18, with the database in `/DATA/AppData/homa/postgres`.

> Untested on real CasaOS hardware. If you try it, please report back on the [QA issue](https://github.com/arsamsarabi/homa/issues/90).

## Install

1. In CasaOS, open the **App Store**, choose **Custom Install**, and import the Compose file (paste it, or upload the file).
2. Before installing, change these environment variables on the `homa` service:
   - `BETTER_AUTH_SECRET`: the output of `openssl rand -base64 32`. The server won't start while it says `REPLACE_ME`.
   - `HOMA_URL`: the address you'll open Homa at, such as `http://casaos.local:3000` or `http://192.168.1.10:3000`. Sign-ins from any other address are refused.
   - `HOMA_ENCRYPTION_KEY`, if you'll connect outside calendars (`openssl rand -base64 32`; keep it with your backups).
3. Install. Open the `homa` container's logs and find `first-run setup code`, then open Homa and create the admin account with that code.

The file follows the [CasaOS app store format](https://github.com/IceWhaleTech/CasaOS-AppStore/blob/main/docs/specs/compose-and-x-casaos.md), so it can also go into a third-party app store as `Apps/Homa/docker-compose.yml`. See [Operations](./operations.md) for backups and upgrades.
