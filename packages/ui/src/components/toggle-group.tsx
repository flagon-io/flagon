"use client";

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { createContext, useContext, type ComponentProps } from "react";
import { cn } from "../lib/cn";
import { controlHeight, focusRingInset, type ControlSize } from "../lib/control";

const ToggleGroupCtx = createContext<{ size: ControlSize }>({ size: "md" });

/** A joined set of toggles for single (type="single") or multiple selection. */
export function ToggleGroup({
  className,
  size = "md",
  children,
  ...props
}: ComponentProps<typeof ToggleGroupPrimitive.Root> & { size?: ControlSize }) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("inline-flex items-center overflow-hidden rounded-md border border-input", className)}
      {...props}
    >
      <ToggleGroupCtx.Provider value={{ size }}>{children}</ToggleGroupCtx.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

export function ToggleGroupItem({ className, ...props }: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const { size } = useContext(ToggleGroupCtx);
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        controlHeight[size],
        "inline-flex items-center justify-center gap-2 px-3 text-sm font-medium text-muted-foreground outline-none transition",
        "hover:bg-panel hover:text-foreground [&:not(:first-child)]:border-l [&:not(:first-child)]:border-input",
        "data-[state=on]:bg-secondary data-[state=on]:text-foreground focus-visible:z-10 disabled:pointer-events-none disabled:opacity-50",
        focusRingInset,
        className,
      )}
      {...props}
    />
  );
}
