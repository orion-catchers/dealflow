# DealFlow360 production image: one Next.js server. PostgreSQL 16 runs elsewhere (managed database or the compose
# `db` service). Apply migrations as a release step before starting new containers:
#   docker run --rm --env-file .env.production dealflow pnpm db:deploy
FROM node:24-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
# postinstall runs `prisma generate`, so the schema and Prisma config come in with the lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
# The Prisma CLI (for `pnpm db:deploy`) is a dev dependency, so the full install is kept.
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "start"]
