import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { componentsByCategory, stableCount, totalCount } from "@/components/docs/registry";

export const metadata = {
  title: "Components - Flagon UI",
  description: "Every component in @flagon-io/ui, grouped by type.",
};

export default function ComponentsIndexPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Components</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Accessible, Radix-based building blocks, grouped by what they do.{" "}
        <span className="text-foreground">{stableCount}</span> shipping today of{" "}
        <span className="text-foreground">{totalCount}</span> on the way to full shadcn/ui parity.
      </p>

      <div className="mt-10 space-y-10">
        {componentsByCategory().map(({ category, items }) => (
          <section key={category.id}>
            <div className="flex items-baseline justify-between gap-3 border-b border-hairline pb-2">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{category.label}</h2>
              <p className="hidden text-sm text-muted-foreground sm:block">{category.blurb}</p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {items.map((c) => {
                const planned = c.status === "planned";
                return (
                  <Link
                    key={c.slug}
                    href={`/ui/components/${c.slug}`}
                    className="group rounded-xl border border-hairline bg-card p-4 transition-colors hover:border-brand/40 hover:bg-panel"
                  >
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-foreground">{c.name}</h3>
                      {planned && (
                        <span className="rounded-full border border-hairline bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Planned
                        </span>
                      )}
                      <ArrowUpRight className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
