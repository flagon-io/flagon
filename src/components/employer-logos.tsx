import { cn } from "@/lib/cn";
import { EMPLOYERS, type EmployerId } from "@/lib/work";

/**
 * The official logos (public/work/logos), each taken from the company's own
 * site header or its Wikimedia Commons file. They're drawn as a mask over the
 * current text color, so every logo reads in one quiet tone in both themes
 * whatever colors the original file uses.
 */
const ASPECT: Record<EmployerId, number> = {
  riot: 503.45 / 163.51,
  imgur: 390 / 136,
  aptive: 135 / 45,
  entrata: 106 / 20,
  outdoorsy: 128 / 29,
  trugolf: 91.5 / 21,
  bluehost: 136 / 24,
};

/**
 * Where each logo's visual weight sits, as a fraction of its height from the
 * top (0.5 is dead center). Measured from the rendered ink: a script wordmark
 * with descenders (Outdoorsy) carries its weight high, a stacked lockup with a
 * heavy lower line (Riot) carries it low. Each logo is nudged so its weight
 * lands on the row's center line, which is what reads as "centered".
 * Re-measure when a logo file changes.
 */
const WEIGHT: Record<EmployerId, number> = {
  riot: 0.498,
  imgur: 0.519,
  aptive: 0.486,
  entrata: 0.533,
  outdoorsy: 0.424,
  trugolf: 0.542,
  bluehost: 0.563,
};

/**
 * One logo. `area` is its visual area in px²: logos of the same area look the
 * same size, so wide wordmarks don't shout over stacked ones.
 */
export function EmployerLogo({
  id,
  name,
  area = 2600,
  align = "center",
  className,
}: {
  id: EmployerId;
  name: string;
  area?: number;
  align?: "center" | "left";
  className?: string;
}) {
  const ar = ASPECT[id];
  const height = Math.sqrt(area / ar);
  const nudge = (0.5 - WEIGHT[id]) * height;
  const src = `url(/work/logos/${id}.svg)`;
  const position = align === "left" ? "left center" : "center";
  return (
    <span
      role="img"
      aria-label={name}
      className={cn("block shrink-0 bg-current", className)}
      style={{
        width: Math.round(Math.sqrt(area * ar)),
        height: Math.round(height),
        transform: Math.abs(nudge) >= 0.5 ? `translateY(${nudge.toFixed(1)}px)` : undefined,
        maskImage: src,
        WebkitMaskImage: src,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: position,
        WebkitMaskPosition: position,
      }}
    />
  );
}

export function EmployerLogos({ className }: { className?: string }) {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 items-center gap-x-6 gap-y-10 sm:grid-cols-4 lg:grid-cols-7",
        className,
      )}
    >
      {EMPLOYERS.map((e) => (
        <li key={e.id} className="flex justify-center" title={`${e.name}, ${e.role}`}>
          <EmployerLogo
            id={e.id}
            name={e.name}
            className="text-muted-foreground transition-colors hover:text-foreground"
          />
        </li>
      ))}
    </ul>
  );
}
