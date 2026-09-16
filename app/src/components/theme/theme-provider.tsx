"use client";

import type { ReactNode } from "react";

/**
 * Root wrapper for the theme system, shadcn/flowbite-style: mount once near
 * the root layout. `theme` selects the brand token set (via `data-theme`);
 * light/dark mode itself is handled by the `.dark` class + ThemeScript, kept
 * separate so brand and color-scheme can vary independently. Flagon's own
 * token set is the default and only one for now - other brands land here
 * once flagon-io/ui grows beyond a single consumer.
 */
export function ThemeProvider({
  theme = "flagon",
  children,
}: {
  theme?: string;
  children: ReactNode;
}) {
  return (
    <div data-theme={theme} className="contents">
      {children}
    </div>
  );
}
