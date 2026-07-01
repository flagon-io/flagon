import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessButton } from '@/components/access-button';
import { SuggestBuildingBlock } from '@/components/suggest-building-block';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarketingHero } from '@/components/marketing-hero';
import {
  committedCapabilities,
  exploringCapabilities,
  moonshotCapabilities,
} from '@/lib/capabilities';

export const metadata: Metadata = {
  title: 'Capabilities',
  description:
    'One hub for everything you run. Start with the Catalog, which is projects, environments, teams, and ownership, then turn on the capabilities you need: feature flags, configuration, secrets, events, and more. Open source, self-host or hosted.',
};

export default function CapabilitiesPage() {
  return (
    <>
      <MarketingHero
        eyebrow="Capabilities"
        title="One hub. Every capability, built in."
        subtitle="It starts with the Catalog, the map of everything you run: projects, environments, teams, and ownership. Then you turn on capabilities that build on it, feature flags first, with configuration, secrets, and events on the way. Each is open source, shares the same primitives, and is yours to run or hosted by us."
      >
        <AccessButton size="lg" />
        <Link href="/pricing" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
          See pricing
        </Link>
      </MarketingHero>

      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {committedCapabilities.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.name}
                className="group flex flex-col bg-background p-7 transition-colors hover:bg-card-muted"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-lg border border-border bg-card-muted text-brand-500 transition-colors group-hover:border-brand-500/40 group-hover:bg-brand-500/10">
                    <Icon className="size-5" strokeWidth={2} />
                  </span>
                  <Badge variant={c.live ? 'brand' : 'neutral'}>{c.status}</Badge>
                </div>
                <h2 className="mt-4 text-lg font-semibold">{c.name}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{c.body}</p>
                {c.live && (
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

        {exploringCapabilities.length > 0 && (
          <div className="mt-14">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Under consideration
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-muted">
                The tools you buy from separate vendors and run on top of your cloud. Flagon is here to
                enable and unify them: we integrate and augment what you already use, and build native
                where it helps, so your whole stack lives in one place instead of fifteen disconnected
                tools.
              </p>
            </div>
            <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-dashed border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {exploringCapabilities.map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.name} className="flex flex-col bg-background/60 p-7">
                    <div className="flex items-center justify-between gap-3">
                      <span className="grid size-10 place-items-center rounded-lg border border-border bg-card-muted text-muted">
                        <Icon className="size-5" strokeWidth={2} />
                      </span>
                      <Badge variant="neutral">{c.status}</Badge>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-muted">{c.name}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{c.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {moonshotCapabilities.length > 0 && (
          <div className="mt-14">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Moonshots</h2>
              <p className="mt-2 max-w-3xl text-sm text-muted">
                Furthest out: the cloud primitives themselves. Reinventing these is a real lift, so it
                is where we are heading, not where we start. We would integrate or lean on a provider
                long before we ever rebuilt one.
              </p>
            </div>
            <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-dashed border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {moonshotCapabilities.map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.name} className="flex flex-col bg-background/40 p-7">
                    <div className="flex items-center justify-between gap-3">
                      <span className="grid size-10 place-items-center rounded-lg border border-border bg-card-muted text-muted">
                        <Icon className="size-5" strokeWidth={2} />
                      </span>
                      <Badge variant="neutral">{c.status}</Badge>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-muted">{c.name}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{c.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-12 flex flex-col items-center gap-3 rounded-xl border border-border bg-card-muted px-6 py-8 text-center">
          <h2 className="text-lg font-semibold">What should we build next?</h2>
          <p className="max-w-xl text-sm text-muted">
            The catalog is the platform, and it&apos;s growing. Tell us which capability you need
            next. It directly shapes what we ship.
          </p>
          <SuggestBuildingBlock variant="primary" className="mt-1" label="Suggest a capability" />
        </div>
      </div>
    </>
  );
}
