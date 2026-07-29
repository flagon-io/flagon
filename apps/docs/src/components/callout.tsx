import type { ReactNode } from "react";
import { Info, Lightbulb, TriangleAlert } from "lucide-react";

type Tone = "note" | "tip" | "warning";

const styles: Record<Tone, { border: string; icon: ReactNode }> = {
  note: {
    border: "border-l-sky-400/60",
    icon: <Info className="h-4 w-4 text-sky-400" />,
  },
  tip: {
    border: "border-l-teal-400/60",
    icon: <Lightbulb className="h-4 w-4 text-teal-400" />,
  },
  warning: {
    border: "border-l-amber-400/60",
    icon: <TriangleAlert className="h-4 w-4 text-amber-400" />,
  },
};

/** A left-accented aside for notes, tips, and warnings. */
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
      className={`my-5 rounded-r-lg border-l-2 ${s.border} bg-white/[0.03] px-4 py-3`}
    >
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-200">
        {s.icon}
        {title ?? tone[0].toUpperCase() + tone.slice(1)}
      </div>
      <div className="text-sm leading-relaxed text-zinc-400 [&_a]:text-teal-400 [&_a:hover]:underline [&_code]:text-zinc-300">
        {children}
      </div>
    </div>
  );
}
