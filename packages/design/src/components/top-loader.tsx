"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * A GitHub-style top progress bar that appears on navigation.
 *
 * Dependency-free and framework-native, and deliberately STABLE: it uses only
 * usePathname (which never suspends), so the component never unmounts/remounts
 * mid-navigation the way a useSearchParams + Suspense boundary can in a
 * production build — which is what caused a double/flickering bar. It STARTS the
 * instant a same-tab link changes the path (or on back/forward via popstate),
 * trickles toward 90% while the route resolves, then FINISHES to 100% and fades
 * when the path actually changes. A safety timeout completes it if a click never
 * lands, so it can never get stuck.
 *
 * Scope: path navigations (the vast majority). Same-path query-only links (e.g.
 * a `?range=90` filter) are intentionally skipped — they re-render in place and
 * have no path change to finish on — as are programmatic router.push() flows,
 * which already show their own in-place pending state.
 *
 * Drop `<TopLoader />` once in a root layout. It renders nothing on the server.
 */

// Brand teal (accentBright over accent) with a soft glow, matching @flagon/design.
const BAR = "#2dd4bf";
const GLOW = "#14b8a6";
const HEIGHT = 3;
const SAFETY_MS = 12_000;

export function TopLoader() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0); // 0..1
  const [visible, setVisible] = useState(false);

  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false);
  const firstRender = useRef(true);

  const clearTimers = useCallback(() => {
    if (trickle.current) clearInterval(trickle.current);
    if (safety.current) clearTimeout(safety.current);
    trickle.current = null;
    safety.current = null;
  }, []);

  const done = useCallback(() => {
    if (!started.current) return;
    started.current = false;
    clearTimers();
    setProgress(1);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 250);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (started.current) return; // already running for this navigation
    if (hideTimer.current) clearTimeout(hideTimer.current);
    started.current = true;
    setVisible(true);
    setProgress(0.08);
    clearTimers();
    // Trickle toward 90%, slowing as it approaches, like a real fetch.
    trickle.current = setInterval(() => {
      setProgress((p) => (p >= 0.9 ? p : p + (0.9 - p) * 0.08));
    }, 220);
    // Never let a click that goes nowhere leave the bar hanging.
    safety.current = setTimeout(done, SAFETY_MS);
  }, [clearTimers, done]);

  // START on back/forward — popstate fires before the previous page re-renders.
  useEffect(() => {
    const onPop = () => start();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      clearTimers();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [start, clearTimers]);

  // START on same-tab link clicks that change the path (so the usePathname
  // finish signal always matches). Ignore new-tab, modified, hash, download, and
  // same-path (query-only) clicks.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      const href = anchor?.getAttribute("href");
      if (!anchor || !href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (href.startsWith("#")) return;
      try {
        const next = new URL(anchor.href, location.href);
        const changesPath =
          next.origin !== location.origin || next.pathname !== location.pathname;
        if (changesPath) start();
      } catch {
        /* malformed href — ignore */
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  // FINISH: the path has actually changed and rendered.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    done();
  }, [pathname, done]);

  if (!visible && progress === 0) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        insetInline: 0,
        top: 0,
        height: HEIGHT,
        zIndex: 2147483647,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 250ms ease",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(progress, 1) * 100}%`,
          background: `linear-gradient(90deg, ${GLOW}, ${BAR})`,
          boxShadow: `0 0 10px ${GLOW}, 0 0 5px ${BAR}`,
          transition: "width 200ms ease",
        }}
      />
    </div>
  );
}
