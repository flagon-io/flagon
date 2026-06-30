# Flagon — single self-host image. Builds the Next.js control plane and, on
# start, applies migrations + RLS before serving. One container gives you the
# whole app (UI + management API + OFREP evaluation) backed by any Postgres.

# ---- Build stage ----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# DB is not reachable at build time; only the bundle is produced here.
RUN pnpm build

# ---- Runtime stage --------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

# Copy the built app and dependencies. Kept simple over maximally lean so the
# migrate-on-start step has drizzle + tsx available.
COPY --from=build /app ./

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# Apply migrations + RLS, then start the server.
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
