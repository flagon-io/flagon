"use client";

import { useSyncExternalStore } from "react";

const UNITS = [
  { key: "days", label: "Days", ms: 24 * 60 * 60 * 1000 },
  { key: "hours", label: "Hours", ms: 60 * 60 * 1000 },
  { key: "minutes", label: "Minutes", ms: 60 * 1000 },
  { key: "seconds", label: "Seconds", ms: 1000 },
] as const;

/**
 * A once-a-second clock, exposed through useSyncExternalStore so it is
 * SSR-correct by construction: the server snapshot is `null`, so the server
 * and the hydrating client both render placeholder dashes, and React swaps in
 * the live time only after subscribe runs on the client. That is what keeps a
 * fixed target date from hydrating against a different "now" and flashing.
 *
 * The snapshot is cached and only advanced inside the interval, so repeated
 * getSnapshot() calls in one render return the same value (a raw Date.now()
 * here would trip React's "getSnapshot should be cached" guard).
 */
let cachedNow: number | null = null;

function subscribe(onChange: () => void) {
  cachedNow = Date.now();
  onChange();
  const timer = setInterval(() => {
    cachedNow = Date.now();
    onChange();
  }, 1000);
  return () => clearInterval(timer);
}

/**
 * The launch countdown. The target instant is fixed (brand.launch.iso); the
 * moving part is the current time, which only the client knows.
 */
export function LaunchCountdown({ iso }: { iso: string }) {
  const target = new Date(iso).getTime();
  const now = useSyncExternalStore(
    subscribe,
    () => cachedNow,
    () => null,
  );

  const remaining = now === null ? null : Math.max(0, target - now);

  // Each unit is what's left after the larger units above it are taken out:
  // hours is the remainder modulo a day, and so on down to seconds.
  function value(index: number) {
    if (remaining === null) return "--";
    let rest = remaining;
    for (let i = 0; i < index; i += 1) rest %= UNITS[i].ms;
    return String(Math.floor(rest / UNITS[index].ms)).padStart(2, "0");
  }

  return (
    <dl
      className="grid max-w-md grid-cols-4 gap-2 sm:gap-3"
      aria-label="Time until launch"
    >
      {UNITS.map((unit, index) => (
        <div
          key={unit.key}
          className="rounded-lg border border-white/10 bg-white/2 px-2 py-3 text-center"
        >
          <dd className="font-mono text-2xl font-semibold tabular-nums text-zinc-100 sm:text-3xl">
            {value(index)}
          </dd>
          <dt className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            {unit.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}
