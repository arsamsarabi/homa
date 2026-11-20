## What and why

<!-- What this changes, and the problem it solves. Link the issue if there is one: "Closes #123". -->

## How it was tested

<!-- Commands you ran and the manual steps you took. For UI changes, add light and dark screenshots. -->

## Checklist

- [ ] Tests cover the change (`bun run test`; set `TEST_DATABASE_URL` so the database tests run)
- [ ] `bun run typecheck` and `bun run lint` pass
- [ ] Schema change: migration generated with `bun run generate <name>` in `packages/db`, and the generated files pass `bun run lint`
- [ ] API route or schema change: `bun run openapi` run and `packages/api-client` committed
- [ ] Upgrade needs action from people running Homa: steps added under `### Breaking` in `docs/CHANGELOG.md`
- [ ] New user-facing strings have English and Farsi entries, and the layout works right to left
- [ ] UI change: screenshots in light and dark above

<!-- Delete items that don't apply. For a security fix, don't describe the vulnerability here: see .github/SECURITY.md. -->
