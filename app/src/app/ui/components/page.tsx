import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { components } from "@/components/docs/registry";

export const metadata = {
  title: "Components - Flagon UI",
  description: "Every component in @flagon-io/ui.",
};

export default function ComponentsIndexPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Components</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        {components.length} accessible, Radix-based building blocks. Pick one for docs, examples,
        and install instructions.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {components.map((c) => (
          <Link
            key={c.slug}
            href={`/ui/components/${c.slug}`}
            className="group rounded-xl border border-hairline bg-card p-4 transition-colors hover:border-brand/40 hover:bg-panel"
          >
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold text-foreground">{c.name}</h2>
              <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
