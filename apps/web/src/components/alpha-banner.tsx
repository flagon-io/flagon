import { DISCORD_URL } from "@/lib/urls";

/**
 * Site-wide early-access notice. Flagon is pre-1.0 and shipping fast; this sets
 * expectations up front on every marketing page (it scrolls away while the header
 * below stays pinned). Links to the community, where the "ship with us" happens.
 */
export function AlphaBanner() {
  return (
    <a
      href={DISCORD_URL}
      target="_blank"
      rel="noreferrer noopener"
      className="group block border-b border-teal-400/20 bg-teal-500/12 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-6 py-2 text-xs">
        <span className="rounded-full border border-teal-400/30 bg-teal-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-teal-300 uppercase">
          Alpha
        </span>
        <span className="text-zinc-300">
          Flagon is in early-access alpha. Expect rough edges and rapid changes.
        </span>
        <span className="text-teal-300 group-hover:underline">Build it with us on Discord &rarr;</span>
      </div>
    </a>
  );
}
