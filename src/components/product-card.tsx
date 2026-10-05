import { ArrowUpRight, Check } from "lucide-react";
import { Schematic } from "@/components/schematic";
import { cn } from "@/lib/cn";
import type { Product } from "@/lib/products";

/**
 * One product, introduced and linked out to its own site. Two columns from lg
 * up: the pitch on the left, its highlights on the right, divided by a rule.
 */
export function ProductCard({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  return (
    <Schematic bleed className={className}>
      <article
        id={product.id}
        className="grid scroll-mt-24 divide-y divide-hairline lg:grid-cols-[1.4fr_1fr] lg:divide-x lg:divide-y-0"
      >
        <div className="p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-hairline bg-background px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-brand">
              {product.status}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-widest text-subtle">
              {product.domain}
            </span>
          </div>
          <h3 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            {product.name}
          </h3>
          <p className="mt-2 text-lg font-medium tracking-tight text-foreground">
            {product.tagline}
          </p>
          <p className="mt-4 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            {product.description}
          </p>
          <a
            href={product.url}
            target="_blank"
            rel="noreferrer"
            className="group mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand"
          >
            Visit {product.domain}
            <ArrowUpRight
              className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              strokeWidth={2}
            />
          </a>
        </div>

        {product.highlights && product.highlights.length > 0 ? (
          <ul className="flex flex-col justify-center gap-3 bg-background/60 p-6 sm:p-8 lg:p-10">
            {product.highlights.map((h) => (
              <li key={h} className="flex items-start gap-3 text-sm">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-brand"
                  strokeWidth={2}
                  aria-hidden
                />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </article>
    </Schematic>
  );
}

/** The empty slot after the last product: there's more coming. */
export function MoreInTheWorks({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border-y border-dashed border-hairline px-6 py-8 text-center sm:px-8",
        className,
      )}
    >
      <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
        More in the works
      </p>
      <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-muted-foreground">
        Each product gets its own site, its own team, and room to become its own
        thing. We&rsquo;ll introduce the next one here when it&rsquo;s ready.
      </p>
    </div>
  );
}
