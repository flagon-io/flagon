import type { Metadata } from "next";
import { Frame } from "@/components/frame";
import { HexField } from "@/components/hex-field";
import { FlagonPour } from "@/components/flagon-pour";
import { Section, SectionHeader } from "@/components/section";
import { Cta } from "@/components/cta";
import { ArtCard } from "@/components/art-card";
import type { SceneName } from "@/components/art/scenes";
import { ProductRail } from "@/components/product-rail";
import { SlantBeams, SlantSplit } from "@/components/slant";
import { site } from "@/lib/site";
import { PRODUCTS } from "@/lib/products";

export const metadata: Metadata = {
  title: "Products",
  description:
    "The products Flagon, Inc. builds, each with its own site and its own team, held to the same standard. The first one is brewing.",
};

const TRAITS: { title: string; body: string; art: SceneName }[] = [
  {
    title: "Crafted, not cranked out",
    art: "craft",
    body: "Quality over quantity, down to the empty states and error copy. If a competitor could slap their logo on it and nobody would notice, it isn't finished.",
  },
  {
    title: "Its own thing",
    art: "panels",
    body: "Every product gets its own name, site, and brand, and a small team that owns it end to end. Flagon is the company behind it, not a logo stamped on top.",
  },
  {
    title: "Open by default",
    art: "open",
    body: "We build in public and open source what we can. You can see how the work gets made and argue with the decisions while they're still being made.",
  },
  {
    title: "Here for the long game",
    art: "stairs",
    body: "We'd rather build a few things people rely on for years than chase whatever's loud this quarter. Products earn their place by being useful.",
  },
];

export default function ProductsPage() {
  return (
    <Frame>
      <main>
        {/* Hero */}
        <section className="relative isolate flex flex-col items-center justify-center px-6 pb-14 pt-20 text-center sm:pt-24">
          <HexField />
          <SlantBeams />
          <div className="rise">
            <FlagonPour className="relative h-32 w-32 sm:h-40 sm:w-40" />
          </div>
          <h1 className="mt-8 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            What we&rsquo;re building.
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {site.legalName} makes software for developers. Each product is its
            own thing, with its own site and the team that builds it. This is
            where we introduce them.
          </p>
        </section>

        {/* The portfolio */}
        <Section divider>
          {PRODUCTS.length > 0 ? (
            <SectionHeader
              title="Our products"
              lead="Pick one to hear why we're building it and how it works, then head over to the product itself. More are on the way."
            />
          ) : (
            <SectionHeader
              title="On the workbench"
              lead="Our first product is still brewing. We'll introduce it here when it's ready to pour, with why we're building it and how it works."
            />
          )}
          <ProductRail className="mt-8" />
          {PRODUCTS.length === 0 && (
            <div className="mt-4 flex flex-col gap-3 px-6 sm:flex-row sm:px-8">
              <Cta href="/blog" variant="secondary">
                Follow along on the blog
              </Cta>
              <Cta href={site.links.discord} external variant="secondary">
                Hear first on Discord
              </Cta>
            </div>
          )}
        </Section>

        {/* The standard */}
        <Section divider>
          <SectionHeader
            title="Held to a standard"
            lead="Different products, one bar. Here's what every one of them is held to, whichever team builds it."
          />
          <div className="mt-10 grid gap-x-4 gap-y-12 px-6 sm:px-8 md:grid-cols-2 lg:grid-cols-4">
            {TRAITS.map((t) => (
              <ArtCard key={t.title} title={t.title} art={t.art} artId={`standard-${t.art}`}>
                {t.body}
              </ArtCard>
            ))}
          </div>
        </Section>

        {/* CTA */}
        <SlantSplit art="panels" artId="products-cta">
          <h2 className="max-w-md text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Want to build the next one?
          </h2>
          <p className="mt-4 max-w-md text-pretty text-muted-foreground">
            Read how the company works, then come talk to us. The handbook is
            the job description.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
            <Cta href="/careers">Work with us</Cta>
            <Cta href="/handbook" variant="secondary">
              Read the handbook
            </Cta>
          </div>
        </SlantSplit>
      </main>
    </Frame>
  );
}
