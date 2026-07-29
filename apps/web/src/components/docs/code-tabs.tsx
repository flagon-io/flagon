"use client";

import { useState } from "react";
import { Code, CopyButton } from "./code-block";

export type CodeTab = {
  /** Tab label, e.g. "Node.js", "Python", "cURL". */
  label: string;
  /** The code shown and copied. */
  code: string;
  /** Optional caption shown under the tab strip (e.g. a filename). */
  caption?: string;
};

/**
 * A tabbed set of code samples with its own local selection (not tied to the
 * global language). For language examples that should sync site-wide, prefer
 * CodeGroup instead.
 */
export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(0);
  const current = tabs[active] ?? tabs[0];

  return (
    <div className="my-5 overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pr-1.5">
        <div className="flex flex-1 flex-wrap">
          {tabs.map((tab, i) => {
            const isActive = i === active;
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => setActive(i)}
                className={
                  "relative px-3.5 py-2.5 text-xs font-medium transition " +
                  (isActive ? "text-teal-300" : "text-zinc-500 hover:text-zinc-300")
                }
              >
                {tab.label}
                {isActive ? (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-teal-400" />
                ) : null}
              </button>
            );
          })}
        </div>
        <CopyButton text={current.code} />
      </div>
      {current.caption ? (
        <div className="border-b border-white/5 px-4 py-1.5 text-[11px] text-zinc-600">
          {current.caption}
        </div>
      ) : null}
      <Code code={current.code} />
    </div>
  );
}
