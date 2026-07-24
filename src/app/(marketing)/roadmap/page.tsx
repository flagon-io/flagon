import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { brand } from "@/lib/brand";
import { appHref } from "@/lib/urls";
import {
  STATUS_META,
  STATUS_ORDER,
  productsByStatus,
  type RoadmapProduct,
} from "@/lib/roadmap";
import { BleedBand } from "@/components/bleed-band";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = {
  title: `Roadmap · ${brand.name}`,
  description: `Where ${brand.name} is headed: the products you'd otherwise buy separately, built on one catalog and one pooled credit. What's live, what's next, and what we're weighing. No dates until they're real.`,
};

/**
 * The public roadmap (`/roadmap`).
 *
 * MARKETING, and honest by construction: it reads from src/lib/roadmap.ts,
 * which is the roadmap, not brand.products (what ships today). Because this
 * page is explicitly "where we're headed," an unbuilt product is truthful here
 * in a way it would not be on the products grid. Grouped by status so the eye
 * separates "use it today" from "on our minds" without a date on anything.
 */

/** Copy for each status band's rail. */
const SECTION: Record<
  (typeof STATUS_ORDER)[number],
  { title: string; note: string }
> = {
  live: { title: "Live", note: "Use it today." },
  building: { title: "In progress", note: "Being built right now." },
  committed: { title: "Committed", note: "Decided. Not started yet." },
  exploring: {
    title: "Exploring",
    note: "On our minds, a direction rather than a promise.",
  },
};

function ProductRow({ product }: { product: RoadmapProduct }) {
  const { icon: Icon, name, tagline, blurb, href, status } = product;
  const meta = STATUS_META[status];

  const heading = (
    <div className="flex items-center gap-2.5">
      <h3 className="text-base font-semibold text-zinc-100">{name}</h3>
      {href ? (
        <ArrowRight
          className="h-4 w-4 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-teal-400"
          aria-hidden
        />
      ) : null}
    </div>
  );

  const inner = (
    <>
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/10 bg-white/2"
      >
        <Icon className={`h-5 w-5 ${meta.icon}`} />
      </span>
      <div>
        {heading}
        <p className="mt-1.5 text-sm font-medium text-zinc-300">{tagline}</p>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-400">
          {blurb}
        </p>
      </div>
    </>
  );

  // A shipped product's row links to its page; an unshipped one is inert, so it
  // can never look clickable-and-broken.
  return href ? (
    <Link
      href={href}
      className="group flex items-start gap-4 p-8 transition hover:bg-white/2"
    >
      {inner}
    </Link>
  ) : (
    <div className="flex items-start gap-4 p-8">{inner}</div>
  );
}

export default function RoadmapPage() {
  return (
    <div className="relative">
      <PageHero
        eyebrow="Roadmap"
        title={
          <>
            The platform,
            <br />
            <span className="text-zinc-500">one product at a time.</span>
          </>
        }
        lede={
          <>
            Every product attaches to the same catalog and draws on the same
            pooled credit, so the next one is a checkbox rather than another
            vendor. Here is what&apos;s live, what&apos;s next, and what
            we&apos;re weighing. No dates until they&apos;re real.
          </>
        }
        actions={
          <>
            <Link
              href={appHref("/new?plan=free")}
              className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
            >
              Start for free
            </Link>
            <Link
              href="/products"
              className="rounded-md border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
            >
              What ships today
            </Link>
          </>
        }
        rule={false}
      />

      {STATUS_ORDER.map((status, index) => {
        const items = productsByStatus(status);
        if (items.length === 0) return null;
        const meta = STATUS_META[status];
        const section = SECTION[status];

        // The first band's own top rule divides it from the hero; later bands
        // take a margin so their rules read as separate section breaks instead
        // of doubling into one heavy line where two bands meet.
        return (
          <BleedBand key={status} outerClassName={index === 0 ? "" : "mt-16"}>
            <div className="grid grid-cols-1 lg:grid-cols-[17rem_1fr]">
              {/* The status rail. Border closes the cell against the rows on
                  large screens; on small it stacks with a bottom rule. */}
              <div className="border-b border-white/10 p-8 lg:border-b-0 lg:border-r">
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${meta.dot}`}
                  />
                  <h2 className="text-lg font-semibold text-zinc-100">
                    {section.title}
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {section.note}
                </p>
              </div>

              <div className="divide-y divide-white/10">
                {items.map((product) => (
                  <ProductRow key={product.name} product={product} />
                ))}
              </div>
            </div>
          </BleedBand>
        );
      })}

      {/* Close: the same argument the homepage makes, so the roadmap lands on
          the point rather than trailing off after the last card. */}
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-6 py-24 text-center">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-zinc-100">
          One platform.{" "}
          <span className="text-zinc-500">Not five subscriptions.</span>
        </h2>
        <p className="mt-4 max-w-xl text-base leading-7 text-zinc-400">
          One login, one pooled bill, and one catalog every product reads from.
          Start on what&apos;s live today; the rest arrives as a checkbox.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={appHref("/new?plan=free")}
            className="rounded-md bg-teal-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
          >
            Start for free
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
          >
            See pricing <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
