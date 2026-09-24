FROM node:26-alpine AS deps
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci

# Local development target: live-reloads on source changes, run with
# `docker compose up` (bind-mounts ./app over /src). Not used for deploys.
FROM deps AS dev
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:26-alpine AS build
WORKDIR /src
COPY --from=deps /src/node_modules ./node_modules
COPY . .
# Emit the standalone server this image runs (`node server.js` in the final stage).
# next.config gates `output: standalone` on this flag so a plain `next start`
# elsewhere (CI e2e) doesn't warn.
ENV NEXT_BUILD_STANDALONE=1
RUN npm run build

# Default (final) target: the deployable artifact (Vercel builds from source
# directly and doesn't use this, but it's what `docker build` produces).
FROM node:26-alpine AS final
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /src/public ./public
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
