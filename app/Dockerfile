FROM node:24-alpine AS deps
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci

# Local development target: live-reloads on source changes, run with
# `docker compose up` (bind-mounts ./app over /src). Not used for deploys.
FROM deps AS dev
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:24-alpine AS build
WORKDIR /src
COPY --from=deps /src/node_modules ./node_modules
COPY . .
RUN npm run build

# Default (final) target: the deployable artifact (Vercel builds from source
# directly and doesn't use this, but it's what `docker build` produces).
FROM node:24-alpine AS final
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /src/public ./public
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
