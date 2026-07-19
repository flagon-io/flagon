<div align="center">
  <img src=".github/avatar-teal.png" alt="Flagon" width="88" height="88" />
  <h1>Flagon</h1>
  <p><strong>Stop building your platform. Start shipping on it.</strong></p>
  <p>The self-hostable developer platform: one hub for your projects, environments, and teams, with the products you'd otherwise buy or build stitched right in.</p>
</div>

---

> Status: early development. The marketing site is live; the app and API surfaces are being built in the open.

## What is Flagon?

Flagon is a developer platform. Each organization gets a catalog of projects with teams, ownership, and permissions, and products plug into that foundation. Feature flags are the first product; more follow, all sharing one catalog, one login, and one bill.

It is fully self-hostable. Stand this single repository up and you have the whole platform from day one, no separate services required. As the hosted offering grows, individual capabilities can be split out into standalone microservices, but the monolith always works on its own.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack) and React 19
- TypeScript and Tailwind CSS 4
- Postgres with row-level security for multitenancy (in progress)

## Quick start

```bash
npm install
cp .env.example .env.local   # optional; sensible defaults work locally
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Script          | Description                       |
| --------------- | --------------------------------- |
| `npm run dev`   | Start the dev server (Turbopack)  |
| `npm run build` | Production build                  |
| `npm run start` | Serve the production build        |
| `npm run lint`  | Lint with ESLint                  |

## Project layout

One repository serves three surfaces. In production they live on subdomains; locally they are reached by path.

| Surface   | Production           | Local path | Source                  |
| --------- | -------------------- | ---------- | ----------------------- |
| Marketing | `www.flagon.io`      | `/`        | `src/app/(marketing)/`  |
| App       | `app.flagon.io/<org>`| `/app`     | `src/app/app/`          |
| API       | `api.flagon.io`      | `/api`     | `src/app/api/`          |

Host-based routing is handled in `src/proxy.ts`. The API always responds in JSON, including 404s and errors. Health check: `GET /api/healthz`.

```
src/
  app/
    (marketing)/   marketing site (own header/footer, OG images, robots, sitemap)
    app/           application shell (distinct chrome, not indexed)
    api/           JSON-only REST API (versioned under /v1)
  components/      shared UI (site header/footer, legal page)
  lib/             brand, logo, api helpers, cross-surface url helpers
  proxy.ts         subdomain -> route-segment mapping
```

## Configuration

Copy `.env.example` to `.env.local`. All values have safe defaults for local development. Set the `NEXT_PUBLIC_*_URL` variables in production so cross-surface links resolve to the correct subdomain (see `src/lib/urls.ts`).

## License

Source-available under the [Functional Source License](LICENSE.md)
(`FSL-1.1-ALv2`). Run it yourself for free. Two years after each release, that
version converts to Apache 2.0.
