import type { Metadata } from "next";
import { Frame } from "@/components/frame";
import { HexField } from "@/components/hex-field";
import { FlagonPour } from "@/components/flagon-pour";
import { Section, SectionHeader } from "@/components/section";
import { Cta } from "@/components/cta";
import { ArtCard } from "@/components/art-card";
import type { SceneName } from "@/components/art/scenes";
import { ProductRail } from "@/components/product-rail";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Products",
  description:
    "The products Flagon, Inc. builds, starting with g1t: git for AI scale. Each one has its own site and its own team, held to the same standard.",
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
          <SectionHeader
            title="Our products"
            lead="Pick one to hear why we're building it and how it works, then head over to the product itself. More are on the way."
          />
          <ProductRail className="mt-8" />
        </Section>

        {/* The standard */}
        <Section divider>
          <SectionHeader
            title="Held to a standard"
            lead="Different products, one bar. Here's what every one of them is held to, whichever team builds it."
          />
          <div className="mt-10 grid gap-4 px-6 sm:px-8 md:grid-cols-2 lg:grid-cols-4">
            {TRAITS.map((t) => (
              <ArtCard key={t.title} title={t.title} art={t.art} artId={`standard-${t.art}`}>
                {t.body}
              </ArtCard>
            ))}
          </div>
        </Section>

        {/* CTA */}
        <Section divider className="text-center">
          <div className="px-6 sm:px-8">
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Want to build the next one?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-pretty text-muted-foreground">
              Read how the company works, then come talk to us. The handbook is
              the job description.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Cta href="/careers">Work with us</Cta>
              <Cta href="/handbook" variant="secondary">
                Read the handbook
              </Cta>
            </div>
          </div>
        </Section>
      </main>
    </Frame>
  );
}
