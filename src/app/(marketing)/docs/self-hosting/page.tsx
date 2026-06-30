import type { Metadata } from 'next';
import { Code, DocNext, H1, H2, Lead, P, Pre } from '@/components/prose';

export const metadata: Metadata = {
  title: 'Self-hosting',
  description:
    'Flagon is fully open source under FSL. Run the whole platform yourself with Docker and any Postgres, or let us host it.',
};

export default function SelfHostingPage() {
  return (
    <div className="max-w-none">
      <p className="eyebrow">Get started</p>
      <H1>Self-hosting</H1>
      <Lead>
        Flagon is fully open source under FSL. You can run the whole platform yourself with Docker and
        any Postgres, on any host, with no managed cloud required, or let us run it for you.
        Self-hosting stays a first-class path as the platform grows.
      </Lead>

      <H2>Run it</H2>
      <P>With the repo cloned:</P>
      <Pre>{`cp .env.example .env
docker compose up --build          # migrates, applies RLS, serves on :3000
docker compose exec app pnpm db:seed   # demo org, flags, and an SDK key`}</Pre>
      <P>
        Compose brings up the app and a Postgres. The same code powers our hosted offering. The only
        production-specific pieces are pluggable behind config (for example the bundle-store driver:{' '}
        <Code>BUNDLE_STORE_DRIVER=postgres</Code> by default, or any S3-compatible object store). As the platform grows
        and pieces like the evaluation data plane split out, they ship in this same repository and the
        Compose stack grows with them, so a complete, runnable platform always comes from one source.
      </P>

      <H2>Platform toggles</H2>
      <P>A few environment variables change how the instance behaves:</P>
      <Pre>{`MULTI_TENANCY=false      # single-org mode: users auto-join one shared org
WAITLIST_ENABLED=true    # invite-only signup instead of open registration
FLAGON_ADMIN_EMAIL=...    # pin the platform (sudo) admin
BUNDLE_STORE_DRIVER=r2   # serve flag bundles from S3-compatible object storage`}</Pre>
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
