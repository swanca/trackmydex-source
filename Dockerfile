# syntax=docker/dockerfile:1.7

# ---------------------------------------------------------------------------
# TrackMyDex
#
# Multi-stage so the runtime image carries no toolchain and no source-only dev
# dependencies.
#
# Next's `standalone` output traces what the *server* imports, which is not the
# same set the CLI scripts need. Those run through tsx and import drizzle-orm,
# pg and the sync providers directly, none of which standalone carries: Next
# bundles them into the server chunk instead of leaving them in node_modules.
# So the runtime gets the production dependency tree as its base, with
# standalone layered on top, plus tsx and esbuild for the scripts.
#
# Build:  docker build -t trackmydex .
# Run:    see docker-compose.yml
# ---------------------------------------------------------------------------

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- deps ------------------------------------------------------------------
# Separate layer so a source-only change does not reinstall the dependency tree.
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# --- production dependencies ------------------------------------------------
# What the CLI scripts need at runtime: drizzle-orm, pg, sharp and friends.
FROM base AS proddeps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# --- build -----------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next needs these at build time to inline NEXT_PUBLIC_* values. They are
# placeholders: everything that matters is read at runtime from the container
# environment, so the same image works in staging and production.
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime

RUN npm run build

# --- runtime ---------------------------------------------------------------
FROM base AS runner
# pg_dump, for the admin backup download. Version-matched to the server:
# pg_dump refuses to dump a database newer than itself.
RUN apk add --no-cache postgresql16-client
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Never run as root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Order matters. The production tree goes down first and standalone is layered
# over it, so Next's own patched copies of the packages it traced win where the
# two overlap, and the scripts still find everything else.
COPY --from=proddeps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migrations and the sync scripts ship with the image so an operator can run
# `docker compose run --rm app npm run sync:catalog` without a source checkout.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
# tsx runs the migration on start and every sync script. It needs esbuild, and
# esbuild needs the platform binary under @esbuild - copying tsx alone leaves
# the container failing at boot with `Cannot find module 'esbuild'`.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/.bin/tsx ./node_modules/.bin/tsx

# Fail the build rather than the deployment if the script runtime is incomplete.
RUN node_modules/.bin/tsx --version

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
