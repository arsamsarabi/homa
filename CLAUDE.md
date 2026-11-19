- [product-definition.md](./docs/product/product-definition.md) what Homa is and its features.
- [architecture.md](./docs/product/architecture.md) the stack and overall architecture.
- [implementation-plan.md](./docs/product/implementation-plan.md) the delivery phases.
- [AGENTS.md](./apps/web/AGENTS.md) the web app's engineering playbook.
- [AGENTS.md](./apps/server/AGENTS.md) the API's and packages' engineering playbook.

## graphify

This project keeps a knowledge graph in graphify-out/ (not committed) with god nodes, community structure and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
