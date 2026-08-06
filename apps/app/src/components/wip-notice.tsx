import { Construction } from "lucide-react";

/**
 * A small "active work in progress" banner. Sits at the top of a not-yet-finished
 * surface so anyone who wanders in during a deploy knows it's still being built, and
 * doesn't judge rough edges as bugs. Presentational only.
 */
export function WipNotice({ feature }: { feature: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-200/80">
      <Construction className="mt-0.5 size-4 shrink-0 text-amber-400/80" />
      <p>
        <span className="font-medium text-amber-200">{feature} is an active work in progress.</span>{" "}
        Expect rough edges and changes while we build it out.
      </p>
    </div>
  );
}
