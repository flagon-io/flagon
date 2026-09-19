"use client";

import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/** A top-level nav with dropdown sections. Compose List > Item > Trigger + Content. */
export function NavigationMenu({ className, children, ...props }: ComponentProps<typeof NavigationMenuPrimitive.Root>) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      className={cn("relative flex max-w-max flex-1 items-center justify-center", className)}
      {...props}
    >
      {children}
      <NavigationMenuViewport />
    </NavigationMenuPrimitive.Root>
  );
}
export function NavigationMenuList({ className, ...props }: ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      className={cn("flex flex-1 list-none items-center justify-center gap-1", className)}
      {...props}
    />
  );
}
export const NavigationMenuItem = NavigationMenuPrimitive.Item;
export const NavigationMenuLink = NavigationMenuPrimitive.Link;

export function NavigationMenuTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
  return (
    <NavigationMenuPrimitive.Trigger
      className={cn(
        "group inline-flex h-9 w-max items-center justify-center gap-1 rounded-md px-3 text-sm font-medium text-foreground outline-none transition-colors",
        "hover:bg-panel focus:bg-panel data-[state=open]:bg-panel",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
    </NavigationMenuPrimitive.Trigger>
  );
}
export function NavigationMenuContent({ className, ...props }: ComponentProps<typeof NavigationMenuPrimitive.Content>) {
  return (
    <NavigationMenuPrimitive.Content className={cn("absolute top-0 left-0 w-full p-2 md:w-auto", className)} {...props} />
  );
}
export function NavigationMenuViewport({
  className,
  ...props
}: ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
  return (
    <div className="absolute top-full left-0 isolate z-50 flex justify-center">
      <NavigationMenuPrimitive.Viewport
        className={cn(
          "relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full origin-top overflow-hidden rounded-lg border border-hairline bg-popover text-popover-foreground shadow-lg md:w-[var(--radix-navigation-menu-viewport-width)]",
          className,
        )}
        {...props}
      />
    </div>
  );
}
