import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { GUTTER } from "@/components/section";
import { Schematic, SchematicGrid } from "@/components/schematic";
import { CAPABILITIES } from "@/lib/work";

/**
 * Everything Flagon takes on, as four stages of one path: strategy, design,
 * build, run.
 *
 * The full version gives each stage a row: a small numbered label, then the
 * work as one line of words that wraps naturally, set a weight lighter than
 * the labels so a long list stays calm. `compact` is the overview for pages
 * where the full list would crowd: each stage as a big word and one line,
 * linking to the full list.
 */
export function Capabilities({
  compact = false,
  href = "/work#capabilities",
  className,
}: {
  compact?: boolean;
  /** Where the compact version's cells link: the full list. */
  href?: string;
  className?: string;
}) {
  if (compact) {
    return (
      <Schematic bleed className={className}>
        <SchematicGrid cols={4} rules="straight">
          {CAPABILITIES.map((c, i) => (
            <Link
              key={c.stage}
              href={href}
              className="group flex flex-col p-6 transition-colors hover:bg-panel sm:p-8"
            >
              <span className="font-mono text-[11px] tracking-widest text-brand">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="mt-3 flex items-center gap-2 text-3xl font-semibold tracking-tight">
                {c.stage}
                <ArrowRight
                  className="h-5 w-5 -translate-x-1 text-brand opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100"
                  strokeWidth={2}
                  aria-hidden
                />
              </span>
              <span className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.summary}</span>
            </Link>
          ))}
        </SchematicGrid>
      </Schematic>
    );
  }

  return (
    <dl className={cn("divide-y divide-hairline border-y border-hairline", className)}>
      {CAPABILITIES.map((c, i) => (
        <div key={c.stage} className={cn(GUTTER, "grid gap-3 py-6 sm:grid-cols-[9rem_1fr] sm:gap-8")}>
          <dt className="pt-1.5 font-mono text-[11px] uppercase tracking-widest text-subtle">
            <span className="text-brand">{String(i + 1).padStart(2, "0")}</span>
            <span className="ml-3 text-foreground">{c.stage}</span>
          </dt>
          <dd className="min-w-0">
            {/* Phones: a two-column list, so no separator ever dangles at a
                line end. From sm up: one line of words with dot separators. */}
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-base font-medium tracking-tight sm:flex sm:flex-wrap sm:gap-x-0 sm:text-xl">
              {c.items.map((item) => (
                <li
                  key={item}
                  className="text-foreground/75 transition-colors hover:text-foreground sm:whitespace-nowrap sm:after:mx-3 sm:after:text-subtle/50 sm:after:content-['·'] sm:last:after:content-none"
                >
                  {item}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}
