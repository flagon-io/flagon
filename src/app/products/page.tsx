import type { Metadata } from "next";
import { Frame } from "@/components/frame";
import { HexField } from "@/components/hex-field";
import { FlagonPour } from "@/components/flagon-pour";
import { Schematic, SchematicGrid } from "@/components/schematic";
import { Section, SectionHeader } from "@/components/section";
import { Cta } from "@/components/cta";
import { ProductCard, MoreInTheWorks } from "@/components/product-card";
import { PRODUCTS } from "@/lib/products";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Products",
  description:
    "The products Flagon, Inc. builds, starting with g1t: git for AI scale. Each one has its own site and its own team, held to the same standard.",
};

const TRAITS: { title: string; body: string }[] = [
  {
    title: "Crafted, not cranked out",
    body: "Quality over quantity, down to the empty states and error copy. If a competitor could slap their logo on it and nobody would notice, it isn't finished.",
  },
  {
    title: "Its own thing",
    body: "Every product gets its own name, site, and brand, and a small team that owns it end to end. Flagon is the company behind it, not a logo stamped on top.",
  },
  {
    title: "Open by default",
    body: "We build in public and open source what we can. You can see how the work gets made and argue with the decisions while they're still being made.",
  },
  {
    title: "Here for the long game",
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
            lead="Everything here is in active development. Follow the links for the product itself: its docs, its pricing, and how to get started."
          />
          <div className="mt-10 flex flex-col gap-10">
            {PRODUCTS.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <MoreInTheWorks />
        </Section>

        {/* The standard */}
        <Section divider>
          <SectionHeader
            title="Held to a standard"
            lead="Different products, one bar. Here's what every one of them is held to, whichever team builds it."
          />
          <Schematic bleed className="mt-10">
            <SchematicGrid cols={4}>
              {TRAITS.map((t) => (
                <div key={t.title} className="p-6 sm:p-8">
                  <h3 className="text-base font-semibold tracking-tight">
                    {t.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {t.body}
                  </p>
                </div>
              ))}
            </SchematicGrid>
          </Schematic>
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
