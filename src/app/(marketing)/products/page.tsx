import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessButton } from '@/components/access-button';
import { SuggestBuildingBlock } from '@/components/suggest-building-block';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarketingHero } from '@/components/marketing-hero';
import { products } from '@/lib/products';

export const metadata: Metadata = {
  title: 'Products',
  description:
    'Every primitive your product needs, in one open-source platform: feature flags, experiments, configuration, eventing, audit, and more. Built on a shared foundation, edge-fast, yours to run or hosted by us.',
};

export default function ProductsPage() {
  return (
    <>
      <MarketingHero
        eyebrow="Products"
        title="Every primitive your product needs."
        subtitle="One platform for the building blocks behind every product: feature flags, experiments, configuration, eventing, audit, and more. Each is open source, edge-fast, and built on the same foundation, so adopting the next one is free. Run it yourself or let us host it."
      >
        <AccessButton size="lg" />
        <Link href="/pricing" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
          See pricing
        </Link>
      </MarketingHero>

      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.name}
                className="group flex flex-col bg-background p-7 transition-colors hover:bg-card-muted"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-lg border border-border bg-card-muted text-brand-500 transition-colors group-hover:border-brand-500/40 group-hover:bg-brand-500/10">
                    <Icon className="size-5" strokeWidth={2} />
                  </span>
                  <Badge variant={p.live ? 'brand' : 'neutral'}>{p.status}</Badge>
                </div>
                <h2 className="mt-4 text-lg font-semibold">{p.name}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{p.body}</p>
                {p.live && (
                  <Link
                    href="/docs"
                    className="mt-4 inline-block text-sm font-medium text-brand-500 hover:text-brand-400"
                  >
                    Read the docs →
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 rounded-xl border border-border bg-card-muted px-6 py-8 text-center">
          <h2 className="text-lg font-semibold">What should we build next?</h2>
          <p className="max-w-xl text-sm text-muted">
            Flagon is the platform layer, and it&apos;s growing. Tell us which primitive you need
            next. It directly shapes what we ship.
          </p>
          <SuggestBuildingBlock variant="primary" className="mt-1" />
        </div>
      </div>
    </>
  );
}
