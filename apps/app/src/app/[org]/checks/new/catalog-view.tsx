"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeftRight,
  Boxes,
  Braces,
  Globe,
  ListOrdered,
  Lock,
  Network,
  Radar,
  Route,
  Server,
  SquareTerminal,
  Theater,
  type LucideIcon,
} from "lucide-react";

/**
 * The Checkly-style Detect catalog. Every card is a check/monitor type; the ones our
 * API implements are live and route to their config form, the rest are "Soon". Keeping
 * the full superset here makes the roadmap legible and lets a new adapter light up its
 * card the moment the API returns it (no console change needed).
 */

type CatalogItem = {
  /** Matches the API monitor-type key when implemented; else a roadmap-only slug. */
  key: string;
  label: string;
  summary: string;
  icon: LucideIcon;
};

const SYNTHETIC: CatalogItem[] = [
  { key: "browser", label: "Browser check", summary: "Check your crucial browser click flows.", icon: Theater },
  { key: "api", label: "API check", summary: "Check speed and validity of API endpoints.", icon: Braces },
  { key: "playwright", label: "Playwright Check Suite", summary: "Run your Playwright suites as tests and monitors.", icon: Theater },
  { key: "multistep", label: "Multistep check", summary: "Chained API calls, requests in sequence.", icon: ListOrdered },
];

const UPTIME: CatalogItem[] = [
  { key: "url", label: "URL monitor", summary: "Verify the availability and response of a URL.", icon: Globe },
  { key: "dns", label: "DNS monitor", summary: "Monitor DNS resolution for a domain.", icon: Network },
  { key: "tcp", label: "TCP monitor", summary: "Monitor connectivity to TCP endpoints.", icon: Server },
  { key: "icmp", label: "ICMP monitor", summary: "Track host reachability and network health.", icon: Radar },
  { key: "traceroute", label: "Traceroute monitor", summary: "Trace network path and measure hop-by-hop latency.", icon: Route },
  { key: "ssl", label: "SSL monitor", summary: "Verify TLS handshake, certificate validity, and expiry.", icon: Lock },
  { key: "grpc", label: "gRPC monitor", summary: "Check speed and validity of gRPC services.", icon: ArrowLeftRight },
  { key: "heartbeat", label: "Heartbeat monitor", summary: "Monitor tasks that run automatically.", icon: Activity },
];

const AS_CODE: { key: string; label: string; summary: string; icon: LucideIcon }[] = [
  { key: "cli", label: "Flagon CLI", summary: "Code, test, and deploy checks.", icon: SquareTerminal },
  { key: "terraform", label: "Terraform", summary: "Manage checks in infrastructure code.", icon: Boxes },
  { key: "pulumi", label: "Pulumi", summary: "Configure checks with Pulumi resources.", icon: Boxes },
];

function Card({ slug, item, live, query }: { slug: string; item: CatalogItem; live: boolean; query: string }) {
  const Icon = item.icon;
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-zinc-300" />
        <span className="text-sm font-medium text-zinc-100">{item.label}</span>
        {!live ? (
          <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
            Soon
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">{item.summary}</p>
    </>
  );
  const cls =
    "block rounded-xl border p-4 transition-colors " +
    (live
      ? "border-white/10 bg-white/2 hover:border-teal-400/40 hover:bg-white/4"
      : "cursor-not-allowed border-white/8 bg-white/1 opacity-70");
  return live ? (
    <Link href={`/${slug}/checks/new/${item.key}${query}`} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls} aria-disabled title="Coming soon">
      {inner}
    </div>
  );
}

function Grid({ slug, items, implemented, query }: { slug: string; items: CatalogItem[]; implemented: Set<string>; query: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.key} slug={slug} item={item} live={implemented.has(item.key)} query={query} />
      ))}
    </div>
  );
}

export function NewCheckCatalog({ slug, implemented, projectKey }: { slug: string; implemented: string[]; projectKey?: string }) {
  const live = new Set(implemented);
  const query = projectKey ? `?project=${encodeURIComponent(projectKey)}` : "";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/${slug}/checks`} className="text-sm text-teal-400 hover:text-teal-300">
          &larr; Checks
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-100">New check</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pick what you want to monitor. Live types are ready now; the rest are on the way.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">Synthetic checks</h2>
            <Grid slug={slug} items={SYNTHETIC} implemented={live} query={query} />
          </section>
          <section>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">Uptime monitors</h2>
            <Grid slug={slug} items={UPTIME} implemented={live} query={query} />
          </section>
        </div>

        <aside className="h-fit rounded-xl border border-white/10 bg-white/2 p-4">
          <h2 className="text-sm font-semibold text-zinc-100">Monitoring as Code</h2>
          <p className="mt-1 text-xs text-zinc-500">Define checks in your repo and deploy them with your app.</p>
          <div className="mt-3 flex flex-col gap-3">
            {AS_CODE.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.key} className="flex items-start gap-2">
                  <Icon className="mt-0.5 size-4 text-zinc-400" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-200">{c.label}</span>
                      <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
                        Soon
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">{c.summary}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
