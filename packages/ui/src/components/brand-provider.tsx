"use client";

import { useId, type ReactNode } from "react";
import { brandCss, type Brand } from "../lib/brand";

/**
 * Applies a Brand to its subtree by injecting the Brand's CSS variables, scoped
 * so nested content re-skins without touching the rest of the page. Light and
 * dark both work (dark values apply under a `.dark` ancestor). Mount it around a
 * whole app, or around a preview to show a Brand live.
 *
 * A Brand is plain config, so this is all it takes to ship a different "vibe" -
 * no build step, no API required.
 */
export function BrandProvider({
  brand,
  children,
  className,
}: {
  brand: Brand;
  children: ReactNode;
  className?: string;
}) {
  const rawId = useId();
  const id = `brand-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const css = brandCss(brand, `[data-brand="${id}"]`);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div data-brand={id} className={className}>
        {children}
      </div>
    </>
  );
}
