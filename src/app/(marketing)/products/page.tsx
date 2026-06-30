import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessButton } from '@/components/access-button';
import { SuggestBuildingBlock } from '@/components/suggest-building-block';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Products',
  description:
    'The platform primitives every team rebuilds (feature flags, experiments, eventing, configuration, audit), built once and open source. Stop reinventing infrastructure; ship your product.',
};

const products = [
  {
    name: 'Feature Flags',
    status: 'Available',
    live: true,
    body: 'OpenFeature-native flags with targeting, segments, and fractional rollouts. Edge-fast evaluation via OFREP, so any OpenFeature SDK points at Flagon. No proprietary client, no lock-in.',
  },
  {
    name: 'Experiments',
    status: 'Coming soon',
    live: false,
    body: 'A/B tests and metrics built directly on the flags you already ship. Measure impact without bolting on a separate analytics tool or rebuilding assignment.',
  },
  {
    name: 'Eventing & Webhooks',
    status: 'Coming soon',
    live: false,
    body: 'Configurable event pipelines: wire sources to destinations with filtering, transforms, retries, signing, and replay. The reliable webhook layer every product reinvents, built once.',
  },
  {
    name: 'Configuration',
    status: 'Planned',
    live: false,
    body: 'Typed, versioned application configuration and secrets, delivered on the same edge-fast pipeline as flags. Change config without a deploy.',
  },
  {
    name: 'Audit Log',
    status: 'Planned',
    live: false,
    body: 'An immutable, queryable trail of every change across the platform, kept separate from the configuration it records. Exportable and compliance-ready.',
  },
];

export default function ProductsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-3xl">
        <p className="eyebrow">Products</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          The platform you keep rebuilding.
        </h1>
        <p className="mt-5 text-lg text-muted">
          Every team rebuilds the same primitives: flags, eventing, configuration, audit. Then they
          relitigate build-vs-buy on the next one. Flagon is those building blocks, built once and
          open source, so you stop reinventing infrastructure and get back to your product.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <AccessButton size="lg" />
          <Link href="/pricing" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            See pricing
          </Link>
        </div>
      </div>

      <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <div key={p.name} className="flex flex-col bg-background p-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <Badge variant={p.live ? 'brand' : 'neutral'}>{p.status}</Badge>
            </div>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{p.body}</p>
            {p.live && (
              <Link
                href="/docs"
                className="mt-4 inline-block text-sm font-medium text-brand-500 hover:text-brand-400"
              >
                Read the docs →
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-col items-center gap-3 rounded-xl border border-border bg-card-muted px-6 py-8 text-center">
        <h2 className="text-lg font-semibold">What should we build next?</h2>
        <p className="max-w-xl text-sm text-muted">
          Flagon exists to kill redundant platform work. Tell us the boring infrastructure you keep
          rebuilding. It directly shapes what we ship.
        </p>
        <SuggestBuildingBlock variant="primary" className="mt-1" />
      </div>
    </div>
  );
}
