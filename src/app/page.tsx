import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Frame } from "@/components/frame";
import { HexField } from "@/components/hex-field";
import { FlagonPour } from "@/components/flagon-pour";
import { ProductRail } from "@/components/product-rail";
import { Section, SectionHeader, GUTTER } from "@/components/section";
import { Cta } from "@/components/cta";
import { ArtCard } from "@/components/art-card";
import { EmployerLogos } from "@/components/employer-logos";
import { Capabilities } from "@/components/capabilities";
import { Schematic } from "@/components/schematic";
import { SlantBeams, SlantSplit } from "@/components/slant";
import { site } from "@/lib/site";
import { getAllPosts, formatDate } from "@/lib/blog";
import { OFFERS } from "@/lib/work";
import { contactHref } from "@/lib/contact";

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
        <SlantBeams />

        <div className="rise" style={{ animationDelay: "0ms" }}>
          <FlagonPour className="relative size-36 sm:size-44" />
        </div>

        <h1
          className="rise mt-8 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl"
          style={{ animationDelay: "120ms" }}
        >
          We build good software,{" "}
          <span className="bg-linear-to-r from-brand-bright to-brand bg-clip-text text-transparent">
            in the open.
          </span>
        </h1>

        <p
          className="rise mt-6 max-w-xl text-pretty text-base/relaxed text-muted-foreground sm:text-lg/relaxed"
          style={{ animationDelay: "180ms" }}
        >
          {site.legalName} is a small, independent software studio. We build
          software for clients, brew products of our own, and run the whole
          company where you can see it: the handbook, the rates, and the way
          we decide.
        </p>

        <div
          className="rise mt-9 flex flex-col items-center gap-3 sm:flex-row"
          style={{ animationDelay: "240ms" }}
        >
          <Cta href={contactHref("project")}>Start a project</Cta>
          <Cta href="/work" variant="secondary">
            See how we work
          </Cta>
        </div>
      </section>

      {/* Track record */}
      <Section divider>
        <p className={`${GUTTER} text-center font-mono text-[11px] uppercase tracking-widest text-subtle`}>
          Before Flagon, Chase built software at
        </p>
        <EmployerLogos className={`mt-10 ${GUTTER}`} />
      </Section>

      {/* Work with us */}
      <Section divider>
        <SectionHeader
          title="Work with us."
          lead="A full-service studio: strategy, UX, design, and engineering under one roof, from the first sketch to running in production. One small senior team, and one published rate for everyone."
        />
        <Capabilities compact className="mt-10" />
        <div className={`mt-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between ${GUTTER}`}>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
              Rates, in the open
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-5 sm:flex sm:flex-wrap sm:gap-x-12">
              {OFFERS.map((o) => (
                <div key={o.id}>
                  <dt className="text-sm text-muted-foreground">{o.title}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tracking-tight sm:text-xl">{o.price}</dd>
                  <dd className="mt-1 font-mono text-[10px] uppercase tracking-widest text-subtle">
                    {o.terms}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <Link
            href="/work#rates"
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-brand"
          >
            See what&rsquo;s included
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </Link>
        </div>
      </Section>

      {/* What we're building */}
      <Section divider>
        <SectionHeader
          title="In the workshop."
          lead="Client work pays the bills and shows us what's missing. Our own products grow out of it, each with its own name and room to grow."
        />
        <ProductRail className="mt-8" />
        <div className="mt-4 px-6 sm:px-8">
          <Link
            href="/products"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand"
          >
            See everything we make
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
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
        <div className={`mt-10 grid gap-x-4 gap-y-12 ${GUTTER} md:grid-cols-2 lg:grid-cols-3`}>
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
            Our rates are on the page, the same for everyone, and our products
            charge what they cost us plus a markup we say out loud.
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
                      <p className="mt-1.5 text-sm/relaxed text-muted-foreground">
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
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2}
                />
              </Link>
            </div>
          </div>
        </Section>
      )}

      {/* Closing CTA */}
      <SlantSplit art="craft" artId="home-cta">
        <h2 className="max-w-md text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Got something worth building?
        </h2>
        <p className="mt-4 max-w-md text-pretty text-muted-foreground">
          Tell us what you have in mind. You&rsquo;ll hear back from the person
          who&rsquo;d do the work, even if the answer is no.
        </p>
        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
          <Cta href={contactHref("project")}>Start a project</Cta>
          <Cta href="/work#rates" variant="secondary">
            See rates
          </Cta>
        </div>
      </SlantSplit>
    </Frame>
  );
}
