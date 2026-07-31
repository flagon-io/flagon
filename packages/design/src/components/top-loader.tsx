"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A GitHub-style top progress bar that appears on navigation.
 *
 * Dependency-free and framework-native: it STARTS on a real navigation —
 * intercepting same-tab link clicks for instant feedback, plus patching
 * history.pushState/replaceState and popstate as the authoritative App Router
 * signals — trickles toward 90% while the next route resolves, then FINISHES to
 * 100% and fades when the path or query actually changes. A safety timeout
 * completes it if a click never leads anywhere, so the bar can never get stuck.
 *
 * Drop `<TopLoader />` once in a root layout. It reads useSearchParams, so it is
 * wrapped in Suspense here (per the app's routing rules) and renders nothing on
 * the server, avoiding any hydration flash.
 */

// Brand teal (accentBright over accent) with a soft glow, matching @flagon/design.
const BAR = "#2dd4bf";
const GLOW = "#14b8a6";
const HEIGHT = 3;
const SAFETY_MS = 12_000;

function TopLoaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
    if (hideTimer.current) clearTimeout(hideTimer.current);
    started.current = true;
    setVisible(true);
    setProgress((p) => (p > 0 && p < 1 ? p : 0.08));
    clearTimers();
    // Trickle toward 90%, slowing as it approaches, like a real fetch.
    trickle.current = setInterval(() => {
      setProgress((p) => (p >= 0.9 ? p : p + (0.9 - p) * 0.08));
    }, 220);
    // Never let a click that goes nowhere leave the bar hanging.
    safety.current = setTimeout(done, SAFETY_MS);
  }, [clearTimers, done]);

  // START: the authoritative App Router signals (client nav uses pushState;
  // back/forward fires popstate). Next 16 calls pushState from INSIDE a React
  // insertion effect, where scheduling a state update synchronously is illegal
  // ("useInsertionEffect must not schedule updates"). So defer start() to a
  // microtask, which runs right after the commit, where setState is fine again.
  useEffect(() => {
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...args: Parameters<History["pushState"]>) => {
      const result = origPush(...args);
      queueMicrotask(start);
      return result;
    };
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      // replaceState is used for shallow updates too; only signal a real one.
      return origReplace(...args);
    };
    const onPop = () => queueMicrotask(start);
    window.addEventListener("popstate", onPop);
    return () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener("popstate", onPop);
      clearTimers();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [start, clearTimers]);

  // START early on same-tab link clicks (instant feedback, before the route
  // resolves). Ignore new-tab, modified, hash-only, download, and no-op clicks.
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
        const changes =
          next.origin !== location.origin ||
          next.pathname !== location.pathname ||
          next.search !== location.search;
        if (changes) start();
      } catch {
        /* malformed href — ignore */
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  // FINISH: the route (path or query) has actually changed and rendered.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    done();
  }, [pathname, searchParams, done]);

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

export function TopLoader() {
  return (
    <Suspense fallback={null}>
      <TopLoaderInner />
    </Suspense>
  );
}
