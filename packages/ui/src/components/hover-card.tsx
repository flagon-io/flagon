"use client";

import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/** A preview card shown on hover/focus. Compose Root > Trigger + Content. */
export const HoverCard = HoverCardPrimitive.Root;
export function HoverCardTrigger(props: ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

export function HoverCardContent({
  className,
  align = "center",
  sideOffset = 8,
  ...props
}: ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-lg border border-hairline bg-popover p-4 text-sm text-popover-foreground shadow-lg outline-none",
          "data-[state=open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}
