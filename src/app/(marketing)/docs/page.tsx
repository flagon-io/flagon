import type { Metadata } from 'next';
import Link from 'next/link';
import { DocNext, H1, H2, Lead, P } from '@/components/prose';

export const metadata: Metadata = {
  title: 'Docs',
  description:
    'Flagon documentation. The open-source developer platform: a catalog of everything you run, with capabilities built on top. Feature flags first, more on the way.',
};

export default function DocsOverview() {
  return (
    <div className="max-w-none">
      <p className="eyebrow">Documentation</p>
      <H1>Overview</H1>
      <Lead>
        Flagon is an open-source developer platform: one hub for everything you run, with the
        capabilities you would otherwise build yourself on top. It starts with the catalog:
        projects, environments, teams, and ownership. Feature Flags is the first capability built on
        it; configuration, secrets, events, and more are on the way.
      </Lead>

      <P>
        Everything in Flagon shares the same foundation: a multitenant{' '}
        <strong className="text-foreground">control plane</strong>{' '}
        (dashboard plus management API) that owns your data, and a{' '}
        <strong className="text-foreground">data plane</strong>{' '}
        that serves each capability&apos;s hot path without touching your primary database. Every
        capability plugs into the same organizations, projects, environments, roles, and billing, so
        you learn it once.
      </P>

      <H2>How the docs are organized</H2>
      <P>
        <strong className="text-foreground">Get started</strong>{' '}covers signing in, the
        quickstart, and self-hosting. Every capability gets its own section as it ships:{' '}
        <strong className="text-foreground">Feature Flags</strong>{' '}is documented first, with the
        rest to follow. <strong className="text-foreground">Reference</strong>{' '}is the generated
        REST API. Deep links stay stable over time.
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
