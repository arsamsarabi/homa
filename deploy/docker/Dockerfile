# One image for every role: HOMA_ROLE=api|worker|all picks what it runs.
# Build from the repo root: docker build -f deploy/docker/Dockerfile -t homa .
ARG BUN_VERSION=1.4.3

FROM oven/bun:${BUN_VERSION}-alpine AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/api-client/package.json packages/api-client/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:${BUN_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/api-client/package.json packages/api-client/
RUN bun install --frozen-lockfile --production --filter @homa/server

FROM oven/bun:${BUN_VERSION}-alpine
WORKDIR /app
ENV NODE_ENV=production \
    TZ=UTC \
    HOMA_WEB_DIR=apps/web/dist \
    PORT=3000
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/apps/server/node_modules apps/server/node_modules
COPY --from=prod-deps /app/packages/db/node_modules packages/db/node_modules
COPY --from=prod-deps /app/packages/core/node_modules packages/core/node_modules
COPY package.json ./
COPY apps/server/package.json apps/server/
COPY apps/server/src apps/server/src
COPY packages/db/package.json packages/db/
COPY packages/db/src packages/db/src
COPY packages/db/drizzle packages/db/drizzle
COPY packages/core/package.json packages/core/
COPY packages/core/src packages/core/src
COPY --from=build /app/apps/web/dist apps/web/dist
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD [ "$HOMA_ROLE" = "worker" ] || bun -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["bun", "apps/server/src/index.ts"]
