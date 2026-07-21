import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Self-hosting",
  description: `Run the whole ${brand.name} platform on your own infrastructure: Postgres, roles, environment, migrations, and scheduled maintenance.`,
};

const h2 = "mt-12 text-xl font-semibold tracking-tight text-zinc-100";
const h3 = "mt-8 text-base font-semibold text-zinc-100";
const p = "mt-3 text-sm leading-6 text-zinc-400";
const li = "text-sm leading-6 text-zinc-400";
const a = "text-teal-400 transition hover:text-teal-300 hover:underline";
const code = "rounded bg-white/5 px-1 py-0.5 text-[13px] text-zinc-200";
const th = "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500";
const td = "border-t border-white/5 px-4 py-2.5 align-top text-sm text-zinc-400";

/**
 * Self-hosting.
 *
 * Everything here is derived from the actual environment contract
 * (.env.example) and the provisioning scripts, not from an idealised install
 * guide. The two-role Postgres setup is the part people get wrong, so it comes
 * before anything else.
 */
export default function SelfHostingDocsPage() {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        Platform
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
        Self-hosting
      </h1>
      <p className={p}>
        {brand.name} is one Next.js application and one Postgres database.
        Self-hosting runs the whole platform with every feature enabled and
        nothing metered: there is no reduced &ldquo;community edition&rdquo;,
        and no capability is held back for the hosted service.
      </p>

      <h2 className={h2}>The short version</h2>
      <p className={p}>
        One command, if you have Docker. This brings up Postgres and the app,
        provisions the restricted database role, applies every migration, and
        serves on port 3000:
      </p>
      <CodeBlock lang="bash" code={`curl -O https://raw.githubusercontent.com/flagon-io/flagon/main/compose.yml

export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
docker compose --profile self-host up -d`} />
      <p className={p}>
        The <span className={code}>self-host</span> profile is what adds the app
        container. Without it the same file starts Postgres alone, which is how
        the project is developed against, so the database you run is the one the
        maintainers exercise daily rather than a second definition kept in step
        by hand.
      </p>
      <p className={p}>
        Open <span className={code}>http://localhost:3000</span> and create the
        first account. Everything below explains what that command did, and what
        to change before putting it in front of anyone.
      </p>

      <h3 className={h3}>The image</h3>
      <p className={p}>
        Published to{" "}
        <span className={code}>ghcr.io/flagon-io/flagon</span> for{" "}
        <span className={code}>linux/amd64</span> and{" "}
        <span className={code}>linux/arm64</span>, so it runs natively on Apple
        silicon and Graviton rather than under emulation. It carries the whole
        platform: marketing site, console, and API.
      </p>
      <p className={p}>
        <strong className="text-zinc-200">Pin a version in production.</strong>{" "}
        <span className={code}>:latest</span> follows the default branch, which
        means a restart can move you onto a new release at the worst possible
        moment. Set <span className={code}>FLAGON_VERSION</span> to a tag and
        upgrade deliberately.
      </p>
      <p className={p}>
        Migrations run on container start, take an advisory lock so replicas
        starting together serialize rather than race, and are idempotent. If you
        would rather run them as a separate job, set{" "}
        <span className={code}>FLAGON_SKIP_MIGRATIONS=1</span> and invoke{" "}
        <span className={code}>node scripts/db-migrate.mjs</span> yourself.
      </p>

      <h2 className={h2}>What you need</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li className={li}>
          Docker, or Node.js if you would rather run the app directly from
          source.
        </li>
        <li className={li}>
          PostgreSQL 15 or newer. Row-level security is load-bearing here, not
          optional.
        </li>
        <li className={li}>
          Nothing else. Email, billing, and scheduled maintenance are each
          optional and degrade cleanly when unconfigured.
        </li>
      </ul>

      <h2 className={h2}>Two database roles, on purpose</h2>
      <p className={p}>
        This is the part worth understanding before you deploy. {brand.name}{" "}
        connects to Postgres as <strong className="text-zinc-200">two
        different roles</strong>:
      </p>
      <div className="mt-4 overflow-x-auto border border-white/10">
        <table className="w-full border-collapse">
          <thead className="bg-white/2">
            <tr>
              <th className={th}>Role</th>
              <th className={th}>Used by</th>
              <th className={th}>Privileges</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}>
                <span className={code}>flagon_owner</span>
                <div className="mt-0.5 text-xs text-zinc-600">
                  DATABASE_URL_OWNER
                </div>
              </td>
              <td className={td}>Migrations and role provisioning only.</td>
              <td className={td}>Owns the schema; can run DDL.</td>
            </tr>
            <tr>
              <td className={td}>
                <span className={code}>flagon_app</span>
                <div className="mt-0.5 text-xs text-zinc-600">
                  DATABASE_URL_APP
                </div>
              </td>
              <td className={td}>Every runtime query the application makes.</td>
              <td className={td}>
                <span className="text-zinc-300">NOSUPERUSER, NOBYPASSRLS</span>,
                no blanket grants. Reaches only tables explicitly granted to it.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={p}>
        The application never connects as the owner. That is what makes tenant
        isolation a property of the database rather than a promise made by
        application code: the runtime role <em>cannot</em> bypass row-level
        security, so a bug in a query cannot cross an organization boundary. A
        table nobody explicitly classified is unreachable rather than readable,
        so a half-finished migration fails closed.
      </p>
      <p className={p}>
        Do not collapse these into one connection string. Pointing{" "}
        <span className={code}>DATABASE_URL_APP</span> at the owner silently
        disables every isolation guarantee in the product.
      </p>

      <h2 className={h2}>Environment</h2>
      <p className={p}>
        The full annotated list is in{" "}
        <span className={code}>.env.example</span>. The required minimum is
        small:
      </p>
      <CodeBlock lang="bash" code={`# Database: two roles, as above.
DATABASE_URL_APP=postgres://flagon_app:...@host:5432/flagon
DATABASE_URL_OWNER=postgres://flagon_owner:...@host:5432/flagon

# Auth. Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=<long random secret>
BETTER_AUTH_URL=https://your-host.example`} />

      <h3 className={h3}>Optional, and what happens without them</h3>
      <div className="mt-4 overflow-x-auto border border-white/10">
        <table className="w-full border-collapse">
          <thead className="bg-white/2">
            <tr>
              <th className={th}>Variable</th>
              <th className={th}>Unset behaviour</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}>
                <span className={code}>RESEND_API_KEY</span>
              </td>
              <td className={td}>
                No email is delivered. Password resets and verification links
                are printed to the server log instead, which keeps a minimal
                self-host fully usable: copy the link out of the logs.
              </td>
            </tr>
            <tr>
              <td className={td}>
                <span className={code}>STRIPE_SECRET_KEY</span>
              </td>
              <td className={td}>
                Billing is off. No plan selection, no free-tier limits, no
                caps, nothing metered. This is the self-host default.
              </td>
            </tr>
            <tr>
              <td className={td}>
                <span className={code}>CRON_SECRET</span>
              </td>
              <td className={td}>
                The maintenance and compaction endpoints refuse to run. Usage
                still records; it just is not compacted or swept.
              </td>
            </tr>
            <tr>
              <td className={td}>
                <span className={code}>NEXT_PUBLIC_ROOT_DOMAIN</span>
              </td>
              <td className={td}>
                Defaults to {brand.name.toLowerCase()}.io. Set it to your own
                domain, or ignore subdomains entirely and reach the app and API
                by path (<span className={code}>/app</span>,{" "}
                <span className={code}>/api</span>).
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className={h2}>Deploy</h2>
      <CodeBlock lang="bash" code={`npm install
npm run db:provision   # create/update flagon_app and its grants (idempotent)
npm run db:migrate     # apply drizzle/*.sql in order, each in a transaction
npm run build
npm run start`} />
      <p className={p}>
        Both database steps are safe to run on every deploy.{" "}
        <span className={code}>db:provision</span>{" "}
        only ever touches the restricted role, never a managed owner role, so it is safe alongside a
        provider&apos;s own integration. <span className={code}>db:migrate</span>{" "}
        takes an advisory lock, so overlapping deploys serialize instead of
        racing, and skips migrations already recorded as applied.
      </p>

      <h3 className={h3}>Local development</h3>
      <CodeBlock lang="bash" code={`npm run db:up   # Postgres, wait for healthy, provision the role, migrate
npm run dev`} />

      <h2 className={h2}>Scheduled maintenance</h2>
      <p className={p}>
        Two endpoints want a scheduler. Both are gated on{" "}
        <span className={code}>CRON_SECRET</span> and expect{" "}
        <span className={code}>Authorization: Bearer &lt;secret&gt;</span>.
      </p>
      <div className="mt-4 overflow-x-auto border border-white/10">
        <table className="w-full border-collapse">
          <thead className="bg-white/2">
            <tr>
              <th className={th}>Endpoint</th>
              <th className={th}>Cadence</th>
              <th className={th}>Does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}>
                <span className={code}>/api/cron/compact</span>
              </td>
              <td className={td}>Hourly</td>
              <td className={td}>
                Folds raw usage events into rollups and ages out old receipts.
                Sets how far behind the usage page can be.
              </td>
            </tr>
            <tr>
              <td className={td}>
                <span className={code}>/api/cron/cleanup</span>
              </td>
              <td className={td}>Daily</td>
              <td className={td}>
                Deletes expired sessions and verification tokens, and stale
                rate-limit counters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={p}>
        Both are idempotent and safe to retry or overlap. On Vercel the{" "}
        <span className={code}>crons</span> entries in{" "}
        <span className={code}>vercel.json</span> already declare them; anywhere
        else, point cron or a systemd timer at the same URLs.
      </p>

      <h2 className={h2}>Upgrading</h2>
      <p className={p}>
        Pull, then run <span className={code}>db:provision</span> and{" "}
        <span className={code}>db:migrate</span> before starting the new build.
        Migrations are plain, ordered SQL files under{" "}
        <span className={code}>drizzle/</span>, each applied once inside a
        transaction and recorded in <span className={code}>schema_migrations</span>
        , so you can read exactly what a release will do to your database
        before you run it.
      </p>

      <h2 className={h2}>What you give up</h2>
      <p className={p}>
        Nothing functional. The trade is operational: you run Postgres, backups,
        TLS, and upgrades yourself, and there is no SLA or support rota behind
        it. If you would rather not,{" "}
        <Link href="/pricing" className={a}>
          the hosted service
        </Link>{" "}
        is the same code.
      </p>
    </div>
  );
}
