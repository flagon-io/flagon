"use client";

import { useState } from "react";
import { CodeBlock } from "./code-block";

export type CodeTab = {
  /** Tab label, e.g. "Node.js", "Python", "cURL". */
  label: string;
  /** The code shown and copied. */
  code: string;
  /** Optional caption shown as the block's label (e.g. a filename). */
  caption?: string;
};

/**
 * A tabbed set of code samples for showing the same task in several languages.
 * Client-side: the selected tab is local state. Pass the samples as `tabs`.
 */
export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(0);
  const current = tabs[active] ?? tabs[0];

  return (
    <div className="my-5">
      <div className="flex flex-wrap gap-1 rounded-t-xl border border-b-0 border-white/10 bg-black/40 px-2 pt-2">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActive(i)}
            className={
              "rounded-md px-3 py-1.5 text-xs font-medium transition " +
              (i === active
                ? "bg-white/10 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Negative margin folds the block's own top border under the tab strip. */}
      <div className="-mt-px [&>div]:my-0 [&>div]:rounded-t-none">
        <CodeBlock raw={current.code} label={current.caption} />
      </div>
    </div>
  );
}
