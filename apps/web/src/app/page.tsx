import {
  BleedBand,
  brand,
  Cta,
  GridBackdrop,
  HexField,
  IconArrowRight,
  IconSelfHost,
  IconStandards,
  IconUsage,
} from "@flagon/design";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SIGN_UP_URL } from "@/lib/urls";

const pillars = [
  {
    icon: IconStandards,
    title: "Standards, not lock-in",
    body: "We build on open standards wherever they exist and stay interoperable with the best ones where they don't. You integrate against the ecosystem, not us, so arriving is a config change and so is leaving.",
  },
  {
    icon: IconUsage,
    title: "Usage, never seats",
    body: "Adding a teammate never changes the bill. One subscription returns as one pooled credit you spend on whichever products you actually use.",
  },
  {
    icon: IconSelfHost,
    title: "Always self-hostable",
    body: "Source-available: run it on your own Postgres, for your own use, with no license fee. A real deployment, not a cut-down demo.",
  },
] as const;

export default function Home() {
  return (
    <>
      <GridBackdrop />
      <SiteHeader />

      <main className="relative z-10 flex flex-1 flex-col">
        {/* Hero. No closing border: the pillars band below draws its own top
            rule, and two hairlines with nothing between them read as one heavy
            line. */}
        <section className="relative overflow-hidden">
          <HexField variant="hero" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-150"
            style={{
              background:
                "radial-gradient(50% 40% at 50% 0%, rgba(20,184,166,0.12) 0%, rgba(20,184,166,0.04) 50%, transparent 100%)",
            }}
          />

          <div className="relative mx-auto w-full max-w-7xl px-6 pb-24 pt-24 sm:px-12 sm:pt-28 lg:px-20">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-teal-400/80">
              {brand.eyebrow}
            </p>

            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight text-zinc-100 sm:text-6xl md:text-7xl">
              {brand.taglineLead}
              <br />
              <span className="text-zinc-500">{brand.taglineFollow}</span>
            </h1>

            <p className="mt-8 max-w-xl text-lg leading-8 text-zinc-400">
              {brand.description}
            </p>

            <div className="mt-12 flex flex-wrap items-center gap-4">
              <Cta
                href={SIGN_UP_URL}
                variant="primary"
                size="lg"
                iconRight={<IconArrowRight className="h-4 w-4" />}
              >
                Get started
              </Cta>
              <Cta href="/docs" variant="secondary" size="lg">
                Read the docs
              </Cta>
            </div>
          </div>
        </section>

        {/* Why it's different */}
        <BleedBand>
          <div className="grid grid-cols-1 divide-y divide-white/10 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {pillars.map(({ icon: Icon, title, body }) => (
              <div key={title} className="p-8">
                <Icon className="h-5 w-5 text-teal-400" />
                <h2 className="mt-4 text-base font-semibold text-zinc-100">
                  {title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
              </div>
            ))}
          </div>
        </BleedBand>

        {/* Built in the open */}
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-6 py-20 sm:px-12 lg:flex-row lg:items-center lg:justify-between lg:px-20">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Built in the open
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Flagon is source-available. Read every line, run the whole
              platform on your own infrastructure, and shape where it goes. No
              cut-down community edition, no bait and switch.
            </p>
          </div>
          <Cta
            href={brand.repo}
            target="_blank"
            rel="noreferrer noopener"
            variant="secondary"
            size="lg"
            iconRight={<IconArrowRight className="h-4 w-4" />}
          >
            View the source
          </Cta>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
