"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Starts immediately for any unmodified internal-link click and clears when
 * Next commits the next pathname. Route loading UI remains the source of truth. */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = `${pathname}?${searchParams.toString()}`;
  const bar = useRef<HTMLDivElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { bar.current?.classList.remove("navigation-progress-active"); }, [route]);
  useEffect(() => {
    const stop = () => { bar.current?.classList.remove("navigation-progress-active"); if (timeout.current) clearTimeout(timeout.current); timeout.current = null; };
    const start = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      stop(); bar.current?.classList.add("navigation-progress-active"); timeout.current = setTimeout(stop, 8000);
    };
    const visibility = () => { if (document.visibilityState === "visible") stop(); };
    document.addEventListener("click", start, true); document.addEventListener("visibilitychange", visibility); window.addEventListener("popstate", stop); window.addEventListener("pageshow", stop); window.addEventListener("pagehide", stop);
    return () => { stop(); document.removeEventListener("click", start, true); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("popstate", stop); window.removeEventListener("pageshow", stop); window.removeEventListener("pagehide", stop); };
  }, [route]);
  return <div ref={bar} className="navigation-progress" role="progressbar" aria-label="Loading page"><span /></div>;
}
