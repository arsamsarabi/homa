# Umbrel

An umbrelOS app package: [`deploy/templates/umbrel/homa/`](../../deploy/templates/umbrel/homa/) (`umbrel-app.yml`, `docker-compose.yml`, `exports.sh`). It runs Homa (web app and background jobs in one container) and Postgres 18, with images pinned by digest, data under `${APP_DATA_DIR}/data/postgres`, and secrets derived per install with `derive_entropy`. It opens on port 3880, behind the Umbrel login.

> Untested on a real Umbrel. If you try it, please report back on the [QA issue](https://github.com/arsamsarabi/homa/issues/91).

## Install from a community app store

1. Make a community app store repository from [getumbrel/umbrel-community-app-store](https://github.com/getumbrel/umbrel-community-app-store). Copy `deploy/templates/umbrel/homa/` into it as `<store-id>-homa/`, and change `id` in `umbrel-app.yml`, `APP_HOST` (`<store-id>-homa_web_1`) and the Postgres host in `DATABASE_URL` (`<store-id>-homa_postgres_1`) to match.
2. In umbrelOS, open the **App Store**, then **⋯ → Community App Stores**, and add your repository's URL.
3. Install Homa, then open **Troubleshoot** on the app to see its logs and find `first-run setup code`. Open Homa and create the admin account with that code.

`HOMA_URL` is `http://<device>.local:3880`, so sign in from that address. Opening Homa by IP address or over HTTPS will refuse the sign-in.

Each release needs a new image tag and digest in `docker-compose.yml` and a new `version` in `umbrel-app.yml`: `docker buildx imagetools inspect ghcr.io/arsamsarabi/homa:<version>` prints the digest.

Submitting to the official Umbrel App Store also needs a pull request to [getumbrel/umbrel-apps](https://github.com/getumbrel/umbrel-apps), a unique port, gallery images and a check of the license terms (Homa is PolyForm Noncommercial).
