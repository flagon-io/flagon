# The app is an npm workspace (app + packages/*) with ONE lockfile at the repo
# root, so this image builds from the repo root:
#
#   docker build -f app/Dockerfile .
#
# (compose.yml sets context: . and dockerfile: app/Dockerfile.)

FROM node:26-alpine AS deps
WORKDIR /src
# Only the manifests, so the install layer caches until a dependency changes.
# Lifecycle scripts are skipped here (the design system's `prepare` builds from
# source that is not copied yet); it is built explicitly in the stages below.
COPY package.json package-lock.json ./
COPY app/package.json app/
COPY packages/ui/package.json packages/ui/
RUN npm ci --ignore-scripts

# Local development target: live-reloads on source changes, run with
# `docker compose up` (bind-mounts ./app and ./packages over /src). The root
# `dev` script builds @flagon-io/ui, then runs `next dev`. Not used for deploys.
FROM deps AS dev
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:26-alpine AS build
WORKDIR /src
COPY --from=deps /src ./
COPY packages/ui packages/ui
COPY app app
# Emit the standalone server this image runs (`node app/server.js` in the final
# stage). next.config gates `output: standalone` on this flag so a plain
# `next start` elsewhere (CI e2e) doesn't warn.
ENV NEXT_BUILD_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace @flagon-io/ui && npm run build --workspace app

# Default (final) target: the deployable artifact (Vercel builds from source
# directly and doesn't use this, but it's what `docker build` produces). In a
# workspace the standalone output mirrors the repo layout, so the server lives
# at app/server.js and reads its static assets from app/.next/static.
FROM node:26-alpine AS final
WORKDIR /srv
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
COPY --from=build /src/app/.next/standalone ./
COPY --from=build /src/app/public ./app/public
COPY --from=build /src/app/.next/static ./app/.next/static
USER node
EXPOSE 3000
CMD ["node", "app/server.js"]
