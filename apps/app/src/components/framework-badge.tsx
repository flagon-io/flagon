import { Boxes } from "lucide-react";
import { cn } from "@flagon/design";
import { frameworkFor } from "@/lib/catalog";

/**
 * The leading icon for a project, keyed off its stack/framework. Today a
 * monogram chip tinted with the framework's brand color; the seam is here so it
 * can be swapped for a real favicon/logo once uploads (R2) land — same call
 * sites, richer icon. Falls back to a neutral box when no stack is set.
 */
const SIZES = {
  sm: "size-6 rounded-md text-[9px]",
  md: "size-9 rounded-lg text-[11px]",
  lg: "size-11 rounded-xl text-sm",
} as const;

export function FrameworkIcon({
  framework,
  size = "md",
  className,
}: {
  framework: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const fw = frameworkFor(framework);
  if (!fw) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center bg-white/5 text-zinc-500",
          SIZES[size],
          className,
        )}
      >
        <Boxes className="size-[55%]" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center border font-semibold tracking-tight",
        SIZES[size],
        className,
      )}
      style={{
        backgroundColor: `${fw.color}22`,
        color: fw.color,
        borderColor: `${fw.color}33`,
      }}
    >
      {fw.mono}
    </span>
  );
}

/**
 * A project's icon: its uploaded image when set, otherwise the stack monogram.
 * The one call site for "show this project's icon" — falls back gracefully, so a
 * project with no image (or a deployment with uploads off) still renders.
 */
export function ProjectIcon({
  image,
  framework,
  size = "md",
  className,
}: {
  image: string | null;
  framework: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- uploaded URLs, not build-time assets
      <img
        src={image}
        alt=""
        className={cn(
          "shrink-0 border border-white/10 object-cover",
          SIZES[size],
          className,
        )}
      />
    );
  }
  return <FrameworkIcon framework={framework} size={size} className={className} />;
}

/** Inline chip + label, for read-only metadata display (e.g. the overview card). */
export function FrameworkBadge({ framework }: { framework: string | null }) {
  const fw = frameworkFor(framework);
  if (!fw) return <span className="text-zinc-500">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <FrameworkIcon framework={framework} size="sm" />
      <span className="text-zinc-200">{fw.label}</span>
    </span>
  );
}
