import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

export type BadgeVariant = "default" | "secondary" | "outline" | "brand" | "success" | "warning";

const variants: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  outline: "border-hairline text-muted-foreground",
  brand: "border-transparent bg-brand/12 text-brand-bright",
  success: "border-transparent bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  warning: "border-transparent bg-amber-500/14 text-amber-600 dark:text-amber-400",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border px-2 py-1 text-[10px] leading-none font-semibold uppercase tracking-wide",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
