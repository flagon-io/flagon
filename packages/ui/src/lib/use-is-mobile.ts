"use client";

import { useEffect, useState } from "react";

/**
 * Reports whether the viewport is phone-sized (touch-first), so components can
 * pick the best control for the device: e.g. a native `<select>` on mobile (the
 * OS wheel/sheet picker) versus a richer Radix control on desktop.
 *
 * SSR-safe: returns false until mounted, then tracks the media query live.
 */
export function useIsMobile(query = "(max-width: 767px)"): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);

  return isMobile;
}
