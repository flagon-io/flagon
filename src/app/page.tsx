import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Frame } from "@/components/frame";
import { HexField } from "@/components/hex-field";
import { FlagonPour } from "@/components/flagon-pour";
import { Schematic } from "@/components/schematic";
import { ProductCard, MoreInTheWorks } from "@/components/product-card";
import { Section, SectionHeader, GUTTER } from "@/components/section";
import { Cta } from "@/components/cta";
import { site } from "@/lib/site";
import { FEATURED_PRODUCT } from "@/lib/products";
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
          lead="Flagon is the company; the products are their own things, each with its own site and room to grow. Here's what's in the workshop."
        />
        <ProductCard product={FEATURED_PRODUCT} className="mt-10" />
        <MoreInTheWorks />
        <div className="mt-8 px-6 sm:px-8">
          <Link
            href="/products"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand"
          >
            All products
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </Link>
        </div>
      </Section>

      {/* Built in the open (identity) */}
      <Section divider>
        <div className={`grid gap-10 ${GUTTER} lg:grid-cols-[1.2fr_1fr] lg:items-center`}>
          <div className="max-w-2xl">
            <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              A company you can read.
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              We run the whole company in public. How we work, what we decide,
              how we pay people, and why: it&rsquo;s a handbook you can open,
              argue with, and hold us to. No big reveal, no culture deck. You
              watch it get made.
            </p>
            <div className="mt-6">
              <Link
                href="/handbook"
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand"
              >
                Read the handbook
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2}
                />
              </Link>
            </div>
          </div>
          <Schematic className="flex flex-col divide-y divide-hairline">
            <Marker k="01" label="Decide in the open" />
            <Marker k="02" label="Ship when it's good, not when it's due" />
            <Marker k="03" label="Let the people using it steer" />
            <Marker k="04" label="Write down why" />
          </Schematic>
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

function Marker({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center gap-4 p-5 sm:p-6">
      <span className="font-mono text-[11px] uppercase tracking-widest text-brand">{k}</span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
