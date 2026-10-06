import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A marketing section with consistent vertical rhythm. Full-bleed Schematic
 * frames provide the horizontal rules, so sections carry no top border by
 * default. Pass `divider` for a full-width hairline on a text-only transition.
 *
 * When a section ends (or starts and ends) with a full-bleed Schematic, pass
 * `bleed` so the frame runs flush to the section's edge: the padding goes, and
 * the frame drops its own rule there because the neighbouring divider already
 * draws it. Otherwise you get an empty strip and a doubled rule.
 */
export function Section({
  children,
  className,
  divider = false,
  bleed,
}: {
  children: ReactNode;
  className?: string;
  divider?: boolean;
  bleed?: "end" | "both";
}) {
  return (
    <section
      className={cn(
        "py-12 sm:py-14",
        divider && "border-t border-hairline",
        bleed && "pb-0! [&>:last-child]:border-b-0",
        bleed === "both" && "pt-0! [&>:first-child]:border-t-0",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The content gutter, aligned with Schematic cell padding. */
export const GUTTER = "px-6 sm:px-8";

/**
 * A left-aligned section heading with an optional lead. Deliberately plain: a
 * heading and a sentence, no kicker label. The heading carries the section.
 */
export function SectionHeader({
  title,
  lead,
  align = "left",
  className,
}: {
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn(GUTTER, className)}>
      <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
        <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {lead ? (
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{lead}</p>
        ) : null}
      </div>
    </div>
  );
}
