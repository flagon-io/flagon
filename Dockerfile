# Flagon, as one self-contained image.
#
# The whole platform runs from this: marketing site, console, and API. It needs
# exactly one thing from you, a PostgreSQL connection, and it provisions its own
# restricted role and applies its own migrations on start.
#
# Built on Next's standalone output, so the runtime layer carries only the
# modules actually reached rather than the full node_modules tree.

# --- deps -------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# Only the manifests, so this layer caches until dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

# --- build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The build must not need real secrets. Anything read at build time gets a
# placeholder; every value that matters is read again at runtime.
ENV NEXT_TELEMETRY_DISABLED=1
# ARG, not ENV: it exists for the length of the build and is never baked into
# an image layer. Nothing here is a real secret, but a placeholder that looks
# like a secret in `docker history` is how people learn the wrong habit.
ARG BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime
# Sentry uploads source maps only when a token is present; without one the
# plugin no-ops, which is what we want for an unauthenticated image build.
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Never run as root. Next writes nothing at runtime, so the filesystem can stay
# owned by root and simply be readable.
RUN addgroup -g 1001 -S flagon && adduser -u 1001 -S flagon -G flagon

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# Migrations and their runner are NOT part of the traced bundle, so they are
# copied explicitly. Shipping them is deliberate: an image that cannot migrate
# its own database makes the operator assemble the release by hand.
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
# The migrator's only dependencies, kept as a minimal tree rather than the
# whole install.
COPY --from=build /app/node_modules/postgres ./node_modules/postgres
COPY --from=build /app/node_modules/dotenv ./node_modules/dotenv
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER flagon
EXPOSE 3000

# Reports unhealthy while the database is unreachable, which is what an
# orchestrator needs to hold traffic back rather than serving 500s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
