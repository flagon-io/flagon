import { cn } from "@flagon/design";

/**
 * A monogram avatar: a deterministic colored circle with one or two initials.
 * The same name always hashes to the same hue, so a person reads consistently
 * across the console without needing an uploaded image. Pure render (no hooks),
 * so it works in both server and client components.
 */

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hueOf(name: string): number {
  const seed = name.trim() || "?";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

const SIZES = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
} as const;

export function MemberAvatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold text-white select-none",
        SIZES[size],
      )}
      style={{ backgroundColor: `hsl(${hueOf(name)} 45% 40%)` }}
    >
      {initialsOf(name)}
    </span>
  );
}
