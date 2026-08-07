"use client";

import type { ReactNode } from "react";
import { Tooltip as RT } from "radix-ui";
import { cn } from "../cn";

/**
 * A hover / focus tooltip built on Radix. Wrap any element to explain it —
 * including a NON-interactive one (a "disabled" control): use `aria-disabled`
 * rather than the native `disabled` attribute on the child so it still receives
 * hover and the tooltip can say WHY it's unavailable. Self-contained (carries its
 * own Provider), so callers don't need a root provider.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delayDuration = 150,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayDuration?: number;
}) {
  if (!content) return <>{children}</>;
  return (
    <RT.Provider delayDuration={delayDuration}>
      <RT.Root>
        <RT.Trigger asChild>{children}</RT.Trigger>
        <RT.Portal>
          <RT.Content
            side={side}
            align={align}
            sideOffset={6}
            className={cn(
              "max-w-xs rounded-md border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 shadow-xl z-50 border select-none",
            )}
          >
            {content}
            <RT.Arrow className="fill-zinc-900" />
          </RT.Content>
        </RT.Portal>
      </RT.Root>
    </RT.Provider>
  );
}
