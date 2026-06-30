import type { Metadata } from 'next';
import { Code, DocNext, H1, H2, Lead, P, Pre } from '@/components/prose';

export const metadata: Metadata = {
  title: 'Self-hosting',
  description: 'Run the whole Flagon platform from a single container backed by any Postgres.',
};

export default function SelfHostingPage() {
  return (
    <div className="max-w-none">
      <p className="eyebrow">Get started</p>
      <H1>Self-hosting</H1>
      <Lead>
        Flagon runs as a single container backed by any Postgres. No Cloudflare or Vercel required.
      </Lead>

      <H2>Run it</H2>
      <P>With the repo cloned:</P>
      <Pre>{`cp .env.example .env
docker compose up --build          # migrates, applies RLS, serves on :3000
docker compose exec app pnpm db:seed   # demo org, flags, and an SDK key`}</Pre>
      <P>
        The same image powers our hosted offering. The only difference is the bundle-store driver
        (Postgres locally, Cloudflare R2 in production via <Code>BUNDLE_STORE_DRIVER</Code>).
      </P>

      <H2>Platform toggles</H2>
      <P>A few environment variables change how the instance behaves:</P>
      <Pre>{`MULTI_TENANCY=false      # single-org mode: users auto-join one shared org
WAITLIST_ENABLED=true    # invite-only signup instead of open registration
FLAGON_ADMIN_EMAIL=...    # pin the platform (sudo) admin
BUNDLE_STORE_DRIVER=r2   # serve flag bundles from Cloudflare R2`}</Pre>
      <P>
        Every variable is documented in <Code>.env.example</Code>. Social login (Google, GitHub,
        Apple) turns on automatically when you set a provider&apos;s client id and secret.
      </P>

      <H2>Migrations</H2>
      <P>
        Migrations and row-level security policies are applied by <Code>pnpm db:migrate</Code>, which
        runs automatically on container start and on every production deploy. The migrator prefers a
        direct (non-pooled) connection and understands the connection variables a managed Postgres
        like Neon provides.
      </P>

      <DocNext href="/docs/feature-flags" label="Feature Flags" />
    </div>
  );
}
