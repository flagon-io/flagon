import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/** A keyboard key hint, e.g. <Kbd>⌘K</Kbd>. */
export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded border border-hairline bg-panel px-1.5 font-mono text-[11px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
