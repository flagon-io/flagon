import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

export type BadgeVariant = "default" | "secondary" | "outline" | "brand" | "success" | "warning";

const variants: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary text-primary-foreground",
  secondary: "border-transparent bg-secondary text-secondary-foreground",
  outline: "border-hairline text-muted-foreground",
  brand: "border-transparent bg-brand/12 text-brand-bright",
  success: "border-transparent bg-success/12 text-success",
  warning: "border-transparent bg-warning/14 text-warning",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(
        "inline-flex items-center justify-center rounded-full border px-2 py-1 text-2xs leading-none font-semibold uppercase tracking-wide",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
