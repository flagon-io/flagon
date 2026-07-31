import type { ReactNode } from "react";
import { Info, Lightbulb, TriangleAlert } from "lucide-react";

type Tone = "note" | "tip" | "warning";

const styles: Record<Tone, { border: string; tint: string; icon: ReactNode }> = {
  note: {
    border: "border-l-sky-400",
    tint: "bg-sky-400/5",
    icon: <Info className="size-4 text-sky-400" />,
  },
  tip: {
    border: "border-l-teal-400",
    tint: "bg-teal-400/5",
    icon: <Lightbulb className="size-4 text-teal-400" />,
  },
  warning: {
    border: "border-l-amber-400",
    tint: "bg-amber-400/5",
    icon: <TriangleAlert className="size-4 text-amber-400" />,
  },
};

/**
 * A left-accented aside for notes, tips, and warnings. The body renders MDX, so
 * its inherited prose margins are normalized here (first/last stripped, inner
 * paragraphs tightened). Otherwise a note's text sits with awkward gaps.
 */
export function Callout({
  tone = "note",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  const s = styles[tone];
  return (
    <div
      className={`my-6 flex gap-3 rounded-lg border border-l-[3px] border-white/10 ${s.border} ${s.tint} px-4 py-3.5`}
    >
      <div className="mt-0.5 shrink-0">{s.icon}</div>
      <div className="min-w-0 flex-1">
        {title ? (
          <p className="mb-1 text-sm font-semibold text-zinc-100">{title}</p>
        ) : null}
        <div className="text-sm/relaxed text-zinc-400 [&_a]:font-medium [&_a]:text-teal-400 [&_a:hover]:underline [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-zinc-200 [&_p]:my-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          {children}
        </div>
      </div>
    </div>
  );
}
