import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Frame } from "@/components/frame";
import { HexField } from "@/components/hex-field";
import { Schematic, SchematicGrid } from "@/components/schematic";
import { Section, SectionHeader, GUTTER } from "@/components/section";
import { Cta } from "@/components/cta";
import { CopyCommand } from "@/components/copy-command";
import { SCENES } from "@/components/art/scenes";
import { SlantBox } from "@/components/slant";
import { PRODUCTS, getProduct } from "@/lib/products";
import { runForAspect } from "@/lib/slant";

/** The hero drawing's panel: its shape, and how far its top leans right. */
const HERO_ASPECT = 6 / 5;
const HERO_RUN = runForAspect(HERO_ASPECT);

type Params = { id: string };

export function generateStaticParams(): Params[] {
  return PRODUCTS.map((p) => ({ id: p.id }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const product = getProduct((await params).id);
  if (!product) return {};
  return {
    title: `${product.name}: ${product.tagline}`,
    description: `${product.page.pitch} ${product.description}`,
  };
}

/**
 * A product's page on the company site: why we're building it, how it works,
 * how it's priced, and then friendly ways into the product on its own site.
 * Everything comes from the product's entry in src/lib/products.ts.
 */
export default async function ProductPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const product = getProduct((await params).id);
  if (!product) notFound();
  const { page } = product;
  const Scene = SCENES[product.card.scene];
  const [primary, secondary] = page.links;

  return (
    <Frame>
      <main>
        {/* Hero */}
        <section className="relative isolate overflow-hidden px-6 pb-14 pt-10 sm:px-8 sm:pt-12">
          <HexField />
          <nav aria-label="Breadcrumb" className="relative">
            <ol className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-subtle">
              <li>
                <Link href="/products" className="transition hover:text-foreground">
                  Products
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-foreground">
                {product.name}
              </li>
            </ol>
          </nav>

          <div className="relative mt-10 grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div className="max-w-2xl">
              <span className="rise inline-block rounded-full border border-hairline bg-background px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-brand">
                {product.status}
              </span>
              <h1
                className="rise mt-6"
                style={{ animationDelay: "60ms" }}
              >
                {/* The product's own logo files, one per theme. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- the product's own published file */}
                <img
                  src={product.logo.light}
                  alt={product.name}
                  className="h-14 w-auto sm:h-20 dark:hidden"
                  style={{ aspectRatio: product.logo.aspect }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element -- the product's own published file */}
                <img
                  src={product.logo.dark}
                  alt={product.name}
                  className="hidden h-14 w-auto sm:h-20 dark:block"
                  style={{ aspectRatio: product.logo.aspect }}
                />
              </h1>
              <p
                className="rise mt-4 text-balance text-2xl font-medium tracking-tight sm:text-3xl"
                style={{ animationDelay: "120ms" }}
              >
                {page.pitch}
              </p>
              <p
                className="rise mt-6 max-w-xl text-pretty leading-relaxed text-muted-foreground sm:text-lg"
                style={{ animationDelay: "180ms" }}
              >
                {product.description}
              </p>
              <div
                className="rise mt-9 flex flex-col gap-3 sm:flex-row"
                style={{ animationDelay: "240ms" }}
              >
                {primary && (
                  <Cta href={primary.href} external>
                    {primary.label}
                  </Cta>
                )}
                {secondary && (
                  <Cta href={secondary.href} external variant="secondary">
                    {secondary.label}
                  </Cta>
                )}
              </div>
            </div>

            {/* The product's drawing, in its own colors, on a panel leaning at
                the site's tilt, like its card on the rail. */}
            <figure className="rise" style={{ animationDelay: "160ms" }}>
              <SlantBox
                run={HERO_RUN}
                style={{ aspectRatio: HERO_ASPECT }}
                frameClassName="rounded-sm border border-white/10 shadow-2xl shadow-black/20"
              >
                <div className="flex h-full flex-col" style={{ background: product.card.background }}>
                  <div
                    className={`${product.card.artClass} min-h-0 flex-1 pb-2 pt-8 sm:pt-10`}
                    style={{ paddingInline: HERO_RUN }}
                  >
                    <Scene id={`hero-${product.id}`} label={page.pitch} className="h-full w-full" />
                  </div>
                  {/* Kept clear of the right edge, which leans in at the bottom. */}
                  <figcaption
                    className="flex items-center justify-between gap-4 border-t border-white/10 py-3.5 pl-5 font-mono text-[10px] uppercase tracking-widest sm:pl-6"
                    style={{ color: product.card.ink, paddingRight: `calc(${HERO_RUN} + 1.25rem)` }}
                  >
                    <span className="opacity-70">{product.domain}</span>
                    <span style={{ color: product.card.accent }}>{product.tagline}</span>
                  </figcaption>
                </div>
              </SlantBox>
            </figure>
          </div>
        </section>

        {/* Why */}
        <Section divider>
          <div className={`grid gap-8 ${GUTTER} lg:grid-cols-[1fr_2fr]`}>
            <div>
              <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                Why we&rsquo;re building it
              </h2>
            </div>
            <div className="max-w-2xl space-y-5 text-pretty leading-relaxed text-muted-foreground">
              {page.story.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>
        </Section>

        {/* How it works */}
        <Section divider>
          <SectionHeader
            title="How it works"
            lead="The workflow you already know, built for a lot more hands on it."
          />
          <Schematic bleed className="mt-10">
            <SchematicGrid cols={4}>
              {page.steps.map((s, i) => (
                <div key={s.title} className="p-6 sm:p-8">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-brand">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 text-base font-semibold tracking-tight">
                    {s.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              ))}
            </SchematicGrid>
          </Schematic>
        </Section>

        {/* What's different */}
        <Section divider>
          <SectionHeader
            title={`What makes ${product.name} different`}
            lead="Hosting git is table stakes. This is the part we care about."
          />
          <Schematic bleed className="mt-10">
            <SchematicGrid cols={3}>
              {page.features.map((f) => (
                <div key={f.title} className="p-6 sm:p-8">
                  <h3 className="text-base font-semibold tracking-tight">
                    {f.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                </div>
              ))}
            </SchematicGrid>
          </Schematic>
        </Section>

        {/* Try it + pricing */}
        <Section divider>
          <div className={`grid gap-12 ${GUTTER} lg:grid-cols-2`}>
            {page.tryIt && (
              <div>
                <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                  Try it in a minute
                </h2>
                <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                  {page.tryIt.lead}
                </p>
                <div className="mt-6">
                  <CopyCommand command={page.tryIt.command} />
                </div>
              </div>
            )}
            <div>
              <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                How it&rsquo;s priced
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                {page.pricing.summary}
              </p>
              <ul className="mt-6 space-y-3">
                {page.pricing.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-3 text-sm">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-brand"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-muted-foreground">
                It&rsquo;s the way we price everything.{" "}
                <Link
                  href="/handbook/priced-close-to-cost"
                  className="font-medium text-brand underline-offset-4 hover:underline"
                >
                  Here&rsquo;s why
                </Link>
                .
              </p>
            </div>
          </div>
        </Section>

        {/* Ways in */}
        <Section divider>
          <SectionHeader
            title="Jump in"
            lead={`${product.name} lives at ${product.domain}. Pick a door.`}
          />
          <Schematic bleed className="mt-10">
            <SchematicGrid cols={4}>
              {page.links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col justify-between gap-8 p-6 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:p-8"
                >
                  <span className="text-lg font-semibold tracking-tight group-hover:text-brand">
                    {l.label}
                  </span>
                  <span className="flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-widest text-subtle">
                    {l.hint}
                    <ArrowUpRight
                      className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </span>
                </a>
              ))}
            </SchematicGrid>
          </Schematic>
          <div className="mt-8 px-6 sm:px-8">
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
      </main>
    </Frame>
  );
}
