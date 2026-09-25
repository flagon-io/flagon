import type { ComponentProps } from "react";
import { cn } from "../lib/cn";

/**
 * A flexible media-object row: leading media (icon/avatar) + content
 * (title/description) + trailing actions. The building block for lists of
 * things - members, files, notifications.
 */
export function Item({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="item" className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5", className)} {...props} />;
}
export function ItemMedia({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="item-media" className={cn("flex shrink-0 items-center justify-center text-muted-foreground", className)} {...props} />;
}
export function ItemContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="item-content" className={cn("flex min-w-0 flex-1 flex-col", className)} {...props} />;
}
export function ItemTitle({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="item-title" className={cn("truncate text-sm font-medium text-foreground", className)} {...props} />;
}
export function ItemDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="item-description" className={cn("truncate text-sm text-muted-foreground", className)} {...props} />;
}
export function ItemActions({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="item-actions" className={cn("flex shrink-0 items-center gap-1", className)} {...props} />;
}
