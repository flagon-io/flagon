import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatQuantity } from "@/lib/meters";
import { appPath } from "@/lib/urls";

/**
 * One hard-capped meter, shown before the ceiling is hit.
 *
 * A cap that a customer only discovers as a 429 in their application is a
 * support ticket and a broken deploy, so the number has to be visible while
 * there is still time to act on it. Only rendered for capped meters on capped
 * plans: where there is no ceiling there is nothing to count down from, and
 * drawing one would invent an alarm that does not exist.
 *
 * Reads the ENFORCEMENT counter, not the priced rollups. The rollups lag by a
 * compaction cycle, and headroom that disagrees with the number that actually
 * refused the request is worse than showing nothing.
 */
export function QuotaMeter({
  orgSlug,
  label,
  unit,
  used,
  limit,
  meter,
}: {
  orgSlug: string;
  label: string;
  unit: string;
  used: number;
  limit: number;
  meter: string;
}) {
  const percent = Math.min(100, Math.round((used / limit) * 100));
  const exhausted = used >= limit;
  // 80% is where this stops being informational: below it the bar is context,
  // above it the customer has a decision to make this week.
  const warning = percent >= 80;

  return (
    <section
      className={`border p-4 ${
        exhausted
          ? "border-red-500/30 bg-red-500/5"
          : warning
            ? "border-amber-400/25 bg-amber-400/5"
            : "border-white/10 bg-white/2"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          {warning ? (
            <AlertTriangle
              className={`h-4 w-4 ${exhausted ? "text-red-400" : "text-amber-400"}`}
              aria-hidden
            />
          ) : null}
          {label}
        </h2>
        <p className="text-sm tabular-nums text-zinc-400">
          <span className="font-medium text-zinc-200">
            {formatQuantity(used)}
          </span>
          <span className="text-zinc-600"> / {formatQuantity(limit)}</span>
        </p>
      </div>

      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/7"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} allowance used`}
      >
        <div
          className={`h-full rounded-full transition-all ${
            exhausted ? "bg-red-500" : warning ? "bg-amber-400" : "bg-teal-500"
          }`}
          style={{ width: `${Math.max(percent, 1)}%` }}
        />
      </div>

      <p className="mt-2.5 text-xs leading-5 text-zinc-500">
        {exhausted ? (
          <>Requests are being refused with 429 until this period resets. </>
        ) : warning ? (
          <>
            {formatQuantity(limit - used)} {unit} left this period.{" "}
          </>
        ) : (
          <>
            Hobby includes {formatQuantity(limit)} {unit} a period and is never
            billed.{" "}
          </>
        )}
        {/* The sync ceiling has a fix that is not "upgrade": conditional
            requests. Saying so is more useful than a upsell, and it is also
            the thing that costs us the bandwidth. */}
        {meter === "flags.syncs" ? (
          <>
            Sending{" "}
            <code className="font-mono text-zinc-400">If-None-Match</code> means
            unchanged configuration returns 304 without counting.{" "}
          </>
        ) : null}
        <Link
          href={appPath(`/${orgSlug}/billing`)}
          className="text-teal-400 transition hover:text-teal-300"
        >
          Upgrade to Pro
        </Link>{" "}
        to remove the cap.
      </p>
    </section>
  );
}
