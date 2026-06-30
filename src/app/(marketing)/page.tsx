import Link from 'next/link';
import { HeroAccess } from '@/components/hero-access';
import { AccessButton } from '@/components/access-button';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const products = [
  {
    name: 'Feature Flags',
    status: 'Available',
    body: 'OpenFeature-native flags with targeting, segments, and fractional rollouts. Edge-fast evaluation that sits on your hot path.',
    live: true,
  },
  {
    name: 'Experiments',
    status: 'Coming soon',
    body: 'A/B tests and metrics built on the same flags you already ship. Measure impact without bolting on another tool.',
    live: false,
  },
  {
    name: 'Eventing & Webhooks',
    status: 'Coming soon',
    body: 'Configurable pipelines from sources to destinations, with filtering, retries, signing, and replay. The webhook layer every product reinvents.',
    live: false,
  },
];

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
            Every team rebuilds the same plumbing: flags, eventing, configuration, audit. Then they
            relitigate build-vs-buy on the next one. Flagon is those primitives, built once and{' '}
            <span className="font-medium text-foreground">open source</span>, so you stop reinventing
            infrastructure and ship your product. Starting with{' '}
            <span className="font-medium text-foreground">feature flags</span>, done right.
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
                One platform. Every primitive you rebuild.
              </h2>
            </div>
            <p className="hidden max-w-xs text-sm text-muted sm:block">
              Learn it once: orgs, roles, API, billing. Every new building block plugs into the same
              foundation, so adopting the next one is free.
            </p>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            {products.map((p) => (
              <div key={p.name} className="bg-background p-7">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <Badge variant={p.live ? 'brand' : 'neutral'}>{p.status}</Badge>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">{p.body}</p>
              </div>
            ))}
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
          <pre className="overflow-x-auto rounded-xl border border-border bg-card p-5 font-mono text-[13px] leading-relaxed text-muted">
            <span className="text-foreground">curl</span> -X POST \{'\n'}
            {'  '}https://api.flagon.io/ofrep/v1/evaluate/flags/new-dashboard \{'\n'}
            {'  '}-H <span className="text-brand-500">&quot;Authorization: Bearer $FLAGON_SDK_KEY&quot;</span> \{'\n'}
            {'  '}-d <span className="text-brand-500">&apos;{'{'}&quot;context&quot;:{'{'}&quot;plan&quot;:&quot;enterprise&quot;{'}'}{'}'}&apos;</span>
            {'\n\n'}
            <span className="opacity-60">{`# => { "key": "new-dashboard", "value": true,
#      "variant": "on", "reason": "TARGETING_MATCH" }`}</span>
          </pre>
        </div>
      </section>

      {/* Dev-first statement */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <h2 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
            Stop rebuilding the{' '}
            <span className="bg-linear-to-r from-brand-500 to-violet-500 bg-clip-text text-transparent">
              wheel.
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-muted">
            Built by developers who got tired of reinventing this on every team. Open source on
            GitHub, self-hostable from a single container, and usage-based, so you pay for what you
            ship, not how many seats you buy.
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
