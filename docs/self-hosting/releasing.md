# Releasing

Maintainer steps to cut a release. Pushing a `vX.Y.Z` tag runs [`release.yml`](../../.github/workflows/release.yml): it runs CI, builds and pushes the image for amd64 and arm64 to `ghcr.io/arsamsarabi/homa` (tagged `X.Y.Z`, `X.Y` and `latest`), signs it with cosign, and creates the GitHub Release with the version's changelog section as its notes. A tag with a pre-release suffix, such as `v1.0.0-rc.1`, becomes a GitHub pre-release and gets only its `X.Y.Z` image tag.

1. In a pull request, prepare [`docs/CHANGELOG.md`](../CHANGELOG.md): move everything under `[Unreleased]` into a new `## [X.Y.Z] - YYYY-MM-DD` section with today's date, and leave `[Unreleased]` empty above it. The workflow refuses a tag whose section is missing, undated or empty. Check it with `.github/scripts/release-notes.sh X.Y.Z`. Update the pinned `HOMA_VERSION=` in the [quick start](./quick-start.md) and the README.
2. Merge the pull request into `main`.
3. Tag the merge commit and push the tag. A signed tag (`git tag -s`) is preferred; a lightweight tag (`git tag v0.1.0`) also works.

   ```sh
   git switch main && git pull
   git tag -s v0.1.0 -m "v0.1.0"
   git push origin v0.1.0
   ```

4. Watch the run: `gh run watch $(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')`, or Actions → Release.
5. Check the result:

   ```sh
   cosign verify ghcr.io/arsamsarabi/homa:0.1.0 \
     --certificate-identity-regexp '^https://github\.com/arsamsarabi/homa/\.github/workflows/release\.yml@refs/tags/v' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com
   ```

   Then upgrade a test instance (or your own) to it as in [Upgrades](./operations.md#upgrades) and check that `curl -fsS http://localhost:3000/api/health` answers `{"status":"ok","version":"0.1.0"}`.

   The first release creates the GHCR package as private. Make it public once, under the package's settings on GitHub, so people can pull it without signing in.

If the run fails before the image is pushed, fix the cause on `main`, then move the tag: `git push origin :refs/tags/v0.1.0`, tag again, and push it again.
