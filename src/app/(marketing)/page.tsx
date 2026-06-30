import Link from 'next/link';
import { HeroAccess } from '@/components/hero-access';
import { AccessButton } from '@/components/access-button';
import { CodeBlock } from '@/components/prose';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { featuredProducts } from '@/lib/products';

const pillars = [
  {
    title: 'OpenFeature-native',
    body: 'We speak OFREP, the standard remote evaluation protocol. Point any OpenFeature SDK at Flagon. No proprietary client, no lock-in.',
  },
  {
    title: 'Edge-fast evaluation',
    body: 'Flags compile to immutable bundles served from edge storage. Evaluation never touches your primary database.',
  },
  {
    title: 'Self-documenting API',
    body: 'A JSON-only API that documents itself with OpenAPI. Predictable errors, stable contracts. No surprises.',
  },
  {
    title: 'Multitenant by design',
    body: 'Organizations, ad-hoc invites, RBAC, per-org SSO. Row-level isolation by default, dedicated infra for your largest tenants.',
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="bg-grid pointer-events-none absolute inset-0"
          style={{ maskImage: 'radial-gradient(70% 60% at 50% 35%, black, transparent)' }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 -top-40 h-120"
          style={{
            background:
              'radial-gradient(40rem 24rem at 50% 0%, var(--glow), transparent 70%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-24 sm:pt-32">
          <p className="eyebrow">The open-source developer platform</p>
          <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
            Build products,
            <br />
            <span className="text-muted">not platforms.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted">
            Every product stands on the same primitives. Flagon builds them once, fully{' '}
            <span className="font-medium text-foreground">open source</span>, on one foundation, so
            your team can build product, not platform. We start with{' '}
            <span className="font-medium text-foreground">feature flags</span>, done right, and
            we&apos;re just getting started.
          </p>

          <div id="access" className="mt-10 max-w-md scroll-mt-20">
            <p className="eyebrow mb-3">Get started</p>
            <HeroAccess />
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="products" className="scroll-mt-16 border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex items-end justify-between">
            <div>
              <p className="eyebrow">Products</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                One platform. Every primitive you need.
              </h2>
            </div>
            <p className="hidden max-w-xs text-sm text-muted sm:block">
              Learn it once: orgs, roles, API, billing. Every new building block plugs into the same
              foundation, so adopting the next one is free.
            </p>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            {featuredProducts.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.name} className="group bg-background p-7 transition-colors hover:bg-card-muted">
                  <div className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-lg border border-border bg-card-muted text-brand-500 transition-colors group-hover:border-brand-500/40 group-hover:bg-brand-500/10">
                      <Icon className="size-5" strokeWidth={2} />
                    </span>
                    <Badge variant={p.live ? 'brand' : 'neutral'}>{p.status}</Badge>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{p.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <Link
              href="/products"
              className="text-sm font-medium text-brand-500 hover:text-brand-400"
            >
              View all products →
            </Link>
          </div>
        </div>
      </section>

      {/* Pillars (numbered) */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="eyebrow">Why Flagon</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Feature flags, engineered like infrastructure.
          </h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
            {pillars.map((f, i) => (
              <div key={f.title} className="bg-background p-7">
                <span className="font-mono text-xs text-muted">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code / API */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow">Capability: open standards</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Evaluate with any OpenFeature SDK.
            </h2>
            <p className="mt-4 text-muted">
              Standards-first is a capability we ship, not a footnote. Flagon implements the full OFREP
              surface and a self-documenting JSON API, so you point the OpenFeature OFREP provider at
              your SDK key and go. No proprietary client, no lock-in. It&apos;s the first of many
              capabilities the platform will expose.
            </p>
            <Link
              href="/docs"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-400"
            >
              Read the docs →
            </Link>
          </div>
          <CodeBlock className="p-5">{`curl -X POST \\
  https://api.flagon.io/ofrep/v1/evaluate/flags/new-dashboard \\
  -H "Authorization: Bearer $FLAGON_SDK_KEY" \\
  -d '{"context":{"plan":"enterprise"}}'

# => { "key": "new-dashboard", "value": true,
#      "variant": "on", "reason": "TARGETING_MATCH" }`}</CodeBlock>
        </div>
      </section>

      {/* Dev-first statement */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h2 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
            Everything your product{' '}
            <span className="bg-linear-to-r from-brand-500 to-violet-500 bg-clip-text text-transparent">
              stands on.
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-muted">
            Built by developers who wanted these primitives to just exist. Fully open source
            under FSL: run it yourself for free, or let us own the upkeep and operations so you
            don&apos;t have to. Usage-based, so you pay for what you ship, not how many seats you buy.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <AccessButton size="lg" />
            <Link href="/pricing" className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
