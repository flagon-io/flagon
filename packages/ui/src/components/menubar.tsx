"use client";

import * as MenubarPrimitive from "@radix-ui/react-menubar";
import type { ComponentProps } from "react";
import { cn } from "../lib/cn";
import { controlHeight } from "../lib/control";

/** A desktop-style application menu bar. Compose Menubar > Menu > Trigger + Content. */
export function Menubar({ className, ...props }: ComponentProps<typeof MenubarPrimitive.Root>) {
  return (
    <MenubarPrimitive.Root
      data-slot="menubar"
      className={cn(
        controlHeight.md,
        "flex items-center gap-0.5 rounded-md border border-input bg-background p-0.5",
        className,
      )}
      {...props}
    />
  );
}
export const MenubarMenu = MenubarPrimitive.Menu;
export function MenubarGroup(props: ComponentProps<typeof MenubarPrimitive.Group>) {
  return <MenubarPrimitive.Group data-slot="menubar-group" {...props} />;
}

export function MenubarTrigger({ className, ...props }: ComponentProps<typeof MenubarPrimitive.Trigger>) {
  return (
    <MenubarPrimitive.Trigger
      data-slot="menubar-trigger"
      className={cn(
        "flex cursor-pointer items-center rounded-sm px-2.5 py-1 text-sm font-medium text-foreground outline-none select-none",
        "focus:bg-panel data-[state=open]:bg-panel",
        className,
      )}
      {...props}
    />
  );
}
export function MenubarContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof MenubarPrimitive.Content>) {
  return (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.Content
        data-slot="menubar-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-48 overflow-hidden rounded-lg border border-hairline bg-popover p-1 text-popover-foreground shadow-lg",
          "data-[state=open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </MenubarPrimitive.Portal>
  );
}
export function MenubarItem({ className, ...props }: ComponentProps<typeof MenubarPrimitive.Item>) {
  return (
    <MenubarPrimitive.Item
      data-slot="menubar-item"
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors",
        "focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
export function MenubarSeparator({ className, ...props }: ComponentProps<typeof MenubarPrimitive.Separator>) {
  return <MenubarPrimitive.Separator data-slot="menubar-separator" className={cn("-mx-1 my-1 h-px bg-hairline", className)} {...props} />;
}
export function MenubarShortcut({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="menubar-shortcut" className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)} {...props} />;
}
