# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# Multi-stage build for the Next.js frontend.
#
# The dependency stage is cached on the lockfile alone, so a source-only change
# never re-runs `npm ci`.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Only the manifests, so this layer's cache key does not include the source.
COPY package.json package-lock.json ./

# `npm ci` rather than `npm install`: it installs exactly the lockfile, fails if
# the lockfile and manifest disagree, and never silently updates a dependency
# during a production build.
RUN npm ci

# -----------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Emits `.next/standalone/server.js` with only the reachable files — the runtime
# stage below copies that instead of the whole `node_modules` tree, which is the
# difference between a ~200 MB image and a ~1 GB one.
#
# Gated behind this variable rather than set in `next.config.ts` unconditionally,
# because standalone output is incompatible with `next start` and would break the
# ordinary local workflow. See the comment in that file.
ENV BUILD_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1

# Runs lint and the type checker as part of the build: a type error fails the
# image, it does not ship inside it.
RUN npm run build

# -----------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Never run as root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# `public` and `.next/static` are not included in the standalone trace — they are
# served by the standalone server but must be copied alongside it.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# `/health` rather than `/`: the root redirects to a page that calls the API, so
# probing it would tie this container's liveness to the backend's availability.
# See the comment in app/health/route.ts.
#
# busybox wget, which the Alpine base does provide — unlike the Debian-based
# backend image, where the equivalent check had to install curl first.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1 || exit 1

# The standalone entry point, not `next start` — see above.
CMD ["node", "server.js"]
