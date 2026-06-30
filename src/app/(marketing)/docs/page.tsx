import type { Metadata } from 'next';
import Link from 'next/link';
import { DocNext, H1, H2, Lead, P } from '@/components/prose';

export const metadata: Metadata = {
  title: 'Docs',
  description:
    'Flagon documentation. The open-source developer platform: feature flags today, with more building blocks on the way.',
};

export default function DocsOverview() {
  return (
    <div className="max-w-none">
      <p className="eyebrow">Documentation</p>
      <H1>Overview</H1>
      <Lead>
        Flagon is an open-source developer platform: the building blocks every company ends up
        rebuilding, in one place. Feature flags is the first product; experiments, access management,
        audit, and more are on the way.
      </Lead>

      <P>
        Everything in Flagon is built on the same foundation: a multitenant{' '}
        <strong className="text-foreground">control plane</strong>{' '}
        (dashboard plus management API) that owns your data, and a{' '}
        <strong className="text-foreground">data plane</strong>{' '}
        that serves each product&apos;s hot path without touching your primary database. New products
        plug into the same organizations, roles, API, and billing, so you learn it once.
      </P>

      <H2>How the docs are organized</H2>
      <P>
        <strong className="text-foreground">Get started</strong> covers signing in, the quickstart,
        and self-hosting. <strong className="text-foreground">Feature Flags</strong> documents the
        first product in depth. <strong className="text-foreground">Reference</strong> is the
        generated REST API. Each feature gets its own page as it ships, so deep links stay stable
        over time.
      </P>

      <H2>Get the platform</H2>
      <P>
        Flagon is fully open source: run it yourself on any Postgres, or use our hosted offering.
        Either way, the same docs apply. The fastest path is the{' '}
        <Link href="/docs/quickstart" className="text-brand-500 hover:text-brand-400">
          quickstart
        </Link>
        .
      </P>

      <DocNext href="/docs/quickstart" label="Quickstart" />
    </div>
  );
}
