"use client";

import * as TogglePrimitive from "@radix-ui/react-toggle";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { controlHeight, focusRing, type ControlSize } from "../lib/control";

/** A two-state button that stays pressed. Drive with pressed/onPressedChange. */
export function Toggle({
  className,
  size = "md",
  ...props
}: Omit<ComponentProps<typeof TogglePrimitive.Root>, "size"> & { size?: ControlSize }) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(
        controlHeight[size],
        "inline-flex items-center justify-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-sm font-medium text-muted-foreground outline-none transition",
        "hover:bg-panel hover:text-foreground",
        focusRing,
        "data-[state=on]:bg-secondary data-[state=on]:text-foreground disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
