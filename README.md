# Homa

A self-hostable calendar that brings your shared calendars, tasks, reminders and routines into one place, and helps a group of people agree on a date.

Homa is in early development. See [docs/product](docs/product) for the product definition, architecture and implementation plan.

## Development

Needs [Bun](https://bun.sh) 1.4.

```sh
bun install
bun run dev        # API on http://localhost:3000/api (health: /api/health, spec: /api/openapi.json)
bun test
bun run typecheck
bun run lint       # bun run format to fix
bun run openapi    # regenerate packages/api-client after changing API routes
```

## License

[PolyForm Noncommercial 1.0.0](LICENSE)
