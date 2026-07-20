"use client";

import { useEffect } from "react";

/**
 * Operations render as native <details> accordions, collapsed by default.
 * This opens (and scrolls to) the one targeted by the URL hash, so deep
 * links like /docs/api#getUser still land expanded.
 */
export function HashOpener() {
  useEffect(() => {
    function openFromHash() {
      const id = window.location.hash.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);
  return null;
}
