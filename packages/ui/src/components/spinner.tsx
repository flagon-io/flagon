import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/** An indeterminate loading indicator. Size/color via className. */
export function Spinner({ className, ...props }: ComponentProps<typeof Loader2>) {
  return (
    <Loader2
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin text-muted-foreground", className)}
      {...props}
    />
  );
}
