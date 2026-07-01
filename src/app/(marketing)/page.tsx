import Link from 'next/link';
import { HeroAccess } from '@/components/hero-access';
import { AccessButton } from '@/components/access-button';
import { CodeBlock } from '@/components/prose';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { featuredCapabilities } from '@/lib/capabilities';

const pillars = [
  {
    title: 'One catalog, one mental model',
    body: 'Register your projects, environments, teams, and ownership once. Every capability reads from the same map, so adopting the next one is basically free.',
  },
  {
    title: 'Batteries included',
    body: 'The capabilities you would otherwise build or buy, like flags, config, secrets, and events, share your primitives instead of bolting on, with much more on the roadmap.',
  },
  {
    title: 'Open source, your way',
    body: 'Self-host the whole platform free under FSL, or let us run it. Open standards like OpenFeature where they exist, so there is no lock-in.',
  },
  {
    title: 'Usage-based',
    body: 'Projects, environments, teams, and members are free. You pay for the throughput you actually use, never per seat.',
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
            Stop building your platform.
            <br />
            <span className="text-muted">Start shipping on it.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted">
            Flagon is the hub you put everything into: your projects, environments, and teams, with
            the platform capabilities you&apos;d otherwise stitch together, built in. It starts with a
            catalog of everything you run, and every capability builds on top. We&apos;re just getting
            started.
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
              <p className="eyebrow">Capabilities</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Bring everything in. Turn on what you need.
              </h2>
            </div>
            <p className="hidden max-w-xs text-sm text-muted sm:block">
              Learn the catalog once: projects, environments, teams. Every capability plugs into the
              same foundation, so adopting the next one is basically free.
            </p>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            {featuredCapabilities.map((p) => {
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
              href="/capabilities"
              className="text-sm font-medium text-brand-500 hover:text-brand-400"
            >
              View all capabilities →
            </Link>
          </div>
        </div>
      </section>

      {/* Pillars (numbered) */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="eyebrow">Why Flagon</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            A developer platform, engineered like infrastructure.
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
            <p className="eyebrow">One API for everything</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              A self-documenting API.
            </h2>
            <p className="mt-4 text-muted">
              Every capability speaks the same JSON API: predictable errors, stable contracts, and an
              OpenAPI document you can generate clients from. Standards-first too, so where an open
              spec exists, like OpenFeature for flags, Flagon implements it and you avoid lock-in.
            </p>
            <Link
              href="/docs"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-400"
            >
              Read the docs →
            </Link>
          </div>
          <CodeBlock className="p-5">{`curl https://api.flagon.io/v1 \\
  -H "Authorization: Bearer $FLAGON_TOKEN"

# => { "health_url": ".../v1/health",
#      "organization_projects_url": ".../v1/orgs/{org}/projects",
#      "openapi_url": ".../openapi.json" }`}</CodeBlock>
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
            Built by developers who wanted the platform layer to just exist. Fully open source
            under FSL: run it yourself for free, or let us own the upkeep and operations so you
            don&apos;t have to. Usage-based, so you pay for what you use, not how many seats you buy.
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
