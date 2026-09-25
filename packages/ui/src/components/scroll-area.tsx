"use client";

import { type ComponentProps, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

type ScrollOrientation = "vertical" | "horizontal" | "both";

const overflowByOrientation: Record<ScrollOrientation, string> = {
  vertical: "overflow-y-auto overflow-x-hidden",
  horizontal: "overflow-x-auto overflow-y-hidden",
  both: "overflow-auto",
};

// The scrollbar is the browser's own, styled with our tokens. A JS-drawn thumb
// (the Radix approach) is repositioned from scroll events, which fire after the
// compositor has already moved the content, so it always trails by a frame and
// visibly stutters under wheel/trackpad scrolling. A native scrollbar moves in the
// same frame as the content. `scrollbar-*` covers Chrome/Edge/Firefox; the
// ::-webkit-scrollbar rules cover Safari (Chromium ignores them once
// scrollbar-color is set).
const scrollbarStyles = [
  "[scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]",
  "hover:[scrollbar-color:var(--color-muted-foreground)_transparent]",
  "[&::-webkit-scrollbar]:size-2.5 [&::-webkit-scrollbar-track]:bg-transparent",
  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid",
  "[&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:bg-clip-padding",
  "[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground",
].join(" ");

export interface ScrollAreaProps extends ComponentProps<"div"> {
  /** Which axis scrolls. Defaults to vertical. */
  orientation?: ScrollOrientation;
}

/**
 * A token-styled scroll container. Give it a height (or width) and let the
 * content overflow. Put padding on the content, not on the ScrollArea.
 */
export function ScrollArea({ className, orientation = "vertical", children, ref, ...props }: ScrollAreaProps) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const overflowing = useOverflowing(innerRef);

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  return (
    <div
      ref={setRefs}
      data-slot="scroll-area"
      data-orientation={orientation}
      // Keyboard users need to reach a region that scrolls but holds nothing
      // focusable, so it becomes a tab stop only while it actually overflows.
      tabIndex={overflowing ? 0 : undefined}
      className={cn(
        "relative rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        overflowByOrientation[orientation],
        scrollbarStyles,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function useOverflowing(ref: RefObject<HTMLDivElement | null>) {
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setOverflowing(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    measure();
    // Size changes, not scroll events: nothing here runs while scrolling.
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    for (const child of Array.from(el.children)) resize.observe(child);
    const mutations = new MutationObserver(measure);
    mutations.observe(el, { childList: true, subtree: true });
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, [ref]);

  return overflowing;
}
