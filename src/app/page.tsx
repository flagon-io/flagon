import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Frame } from "@/components/frame";
import { HexField } from "@/components/hex-field";
import { FlagonPour } from "@/components/flagon-pour";
import { Schematic } from "@/components/schematic";
import { ProductRail } from "@/components/product-rail";
import { Section, SectionHeader, GUTTER } from "@/components/section";
import { Cta } from "@/components/cta";
import { ArtCard } from "@/components/art-card";
import { site } from "@/lib/site";
import { getAllPosts, formatDate } from "@/lib/blog";

export const metadata: Metadata = {
  description: site.description,
};

export default function Home() {
  const posts = getAllPosts().slice(0, 3);

  return (
    <Frame>
      {/* Hero */}
      <section className="relative isolate flex flex-col items-center justify-center px-6 pb-14 pt-20 text-center sm:pt-24">
        <HexField />

        <div className="rise" style={{ animationDelay: "0ms" }}>
          <FlagonPour className="relative h-36 w-36 sm:h-44 sm:w-44" />
        </div>

        <h1
          className="rise mt-8 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
          style={{ animationDelay: "120ms" }}
        >
          We make good software,{" "}
          <span className="bg-linear-to-r from-brand-bright to-brand bg-clip-text text-transparent">
            in the open.
          </span>
        </h1>

        <p
          className="rise mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
          style={{ animationDelay: "180ms" }}
        >
          {site.legalName} is a small, independent software company. We build
          products for developers, and we run the whole company where you can
          see it: the handbook, the pay, and the way we decide.
        </p>

        <div
          className="rise mt-9 flex flex-col items-center gap-3 sm:flex-row"
          style={{ animationDelay: "240ms" }}
        >
          <Cta href="/products">See what we&rsquo;re building</Cta>
          <Cta href="/handbook" variant="secondary">
            Read the handbook
          </Cta>
        </div>
      </section>

      {/* What we're building */}
      <Section divider>
        <SectionHeader
          title="What we're building."
          lead="Flagon is the company; the products are their own things, each with its own name and room to grow. Here's what's in the workshop."
        />
        <ProductRail className="mt-8" />
        <div className="mt-4 px-6 sm:px-8">
          <Link
            href="/products"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand"
          >
            See everything we make
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </Link>
        </div>
      </Section>

      {/* How we run the place */}
      <Section divider>
        <SectionHeader
          title="A company you can read."
          lead="We run the whole company in public. How we work, how we pay people, how we price, and why: it's all written down, and you can hold us to it."
        />
        <div className={`mt-10 grid gap-4 ${GUTTER} md:grid-cols-2 lg:grid-cols-3`}>
          <ArtCard
            title="The handbook"
            art="handbook"
            className="lg:col-span-2"
            chips={[
              { label: "Values", href: "/handbook/values" },
              { label: "Pay formula", href: "/handbook/compensation" },
              { label: "Decisions", href: "/handbook/decisions" },
              { label: "Time off", href: "/handbook/time-off" },
              { label: "How we hire", href: "/handbook/how-we-hire" },
            ]}
          >
            How the company actually runs, not a polished excerpt. What we value,
            how we decide, how we pay people down to the formula. If something
            reads badly, that&rsquo;s a bug, and anyone can send a fix.
          </ArtCard>
          <ArtCard
            title="Built in the open"
            art="open"
            chips={[
              { label: "Open source", href: "/handbook/open-source" },
              { label: "g1t's code", href: "https://g1t.sh/flagon-io/g1t", external: true },
              { label: "This site", href: site.links.repo, external: true },
            ]}
          >
            Open source is where every product starts. The code, the reasoning,
            and the mistakes, out where you can read them.
          </ArtCard>
          <ArtCard
            title="Priced close to cost"
            art="pricing"
            chips={[
              { label: "Why", href: "/handbook/priced-close-to-cost" },
              { label: "How we make money", href: "/handbook/how-we-make-money" },
            ]}
          >
            What it costs us, plus a markup we say out loud. No seats, no
            surprise bills, and the price book is public.
          </ArtCard>
          <ArtCard
            title="Small teams, whole ownership"
            art="teams"
            className="lg:col-span-2"
            chips={[
              { label: "How we're structured", href: "/handbook/how-were-structured" },
              { label: "How teams work", href: "/handbook/how-our-teams-work" },
              { label: "The teams", href: "/teams" },
              { label: "The people", href: "/people" },
            ]}
          >
            Each product gets a small team that owns it end to end, from the
            first line of code to the support inbox. The company underneath is
            shared: the values, this handbook, and how we hire and pay.
          </ArtCard>
        </div>
      </Section>

      {/* Latest from the blog */}
      {posts.length > 0 && (
        <Section divider>
          <SectionHeader
            title="We write things down"
            lead="Notes from building a company in public: decisions, mistakes, and the occasional strong opinion."
          />
          <div className="mt-10">
            <Schematic bleed>
              <div className="divide-y divide-hairline">
                {posts.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/blog/${p.slug}`}
                    className="group flex flex-col gap-2 p-6 transition hover:bg-panel sm:flex-row sm:items-baseline sm:justify-between sm:gap-8 sm:p-8"
                  >
                    <div className="max-w-2xl">
                      <h3 className="text-lg font-semibold tracking-tight group-hover:text-brand">
                        {p.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {p.description}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-widest text-subtle">
                      {formatDate(p.date)}
                    </span>
                  </Link>
                ))}
              </div>
            </Schematic>
            <div className="mt-6 px-6 sm:px-8">
              <Link
                href="/blog"
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand"
              >
                All posts
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2}
                />
              </Link>
            </div>
          </div>
        </Section>
      )}

      {/* Closing CTA */}
      <Section divider className="text-center">
        <div className={GUTTER}>
          <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Come build with us.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-pretty text-muted-foreground">
            Read the handbook, see how we hire, or jump into Discord and tell us
            what you wish existed. It&rsquo;s all in the open.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Cta href="/careers">Work with us</Cta>
            <Cta href={site.links.discord} external variant="secondary">
              Join the Discord
            </Cta>
          </div>
        </div>
      </Section>
    </Frame>
  );
}
