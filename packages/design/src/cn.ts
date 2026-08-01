import { twMerge } from "tailwind-merge";

/**
 * Compose class names so a caller's `className` reliably OVERRIDES a component's
 * base utilities. `twMerge` resolves conflicting Tailwind utilities by keeping
 * the last one, so `cn("w-full h-10", "w-16")` yields `h-10 w-16` (the caller's
 * width wins) instead of two colliding `width` utilities where Tailwind's emit
 * order silently decided the winner.
 *
 * Falsy parts are dropped, so `cn(base, cond && "x", className)` is safe.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
