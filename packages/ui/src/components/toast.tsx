"use client";

import { Toaster as Sonner, toast } from "sonner";
import type { ComponentProps, CSSProperties } from "react";

/**
 * Transient, stacked notifications (Sonner). Mount `<Toaster />` once near the
 * app root, then call `toast(...)` anywhere. Colors map to Flagon tokens via CSS
 * variables, so it follows light/dark and the active Brand automatically without
 * a theme library.
 */
export function Toaster({ className, style, ...props }: ComponentProps<typeof Sonner>) {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--color-popover)",
          "--normal-text": "var(--color-popover-foreground)",
          "--normal-border": "var(--color-hairline)",
          "--border-radius": "var(--radius-lg, 0.5rem)",
          ...style,
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:border group-[.toaster]:border-hairline group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground",
        },
      }}
      {...props}
    />
  );
}

export { toast };
