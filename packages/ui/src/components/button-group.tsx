import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/**
 * A joined row of related buttons acting as a segmented control. Put `Button`s
 * inside; the group squares off their inner corners and collapses the seam.
 */
export function ButtonGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        "inline-flex items-center",
        "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none",
        "[&>*:not(:first-child)]:-ml-px focus-within:[&>*:focus-visible]:z-10",
        className,
      )}
      {...props}
    />
  );
}
