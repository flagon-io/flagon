import { redirect } from "next/navigation";
import Link from "next/link";
import { Calendar, ChevronRight, MessagesSquare, Phone, Plug, Video } from "lucide-react";
import {
  IconBitbucket,
  IconDiscord,
  IconGitHub,
  IconGitLab,
  IconSlack,
} from "@flagon/design";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";
import { getIntegrations, type IntegrationCatalogEntry } from "@/lib/integrations-api";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";

/**
 * Settings → Integrations. The INDEX of everything the org can connect, rendered
 * entirely from the canonical catalog the API serves (one source of truth, shared
 * with every product). Bring-your-own providers that are live route to their own
 * setup page; OAuth app-installs and planned providers show as coming soon. This
 * page only lists and routes — configuring happens on `integrations/[provider]`.
 */

type ProviderIcon = (props: { className?: string }) => React.ReactNode;

const PROVIDER_ICONS: Record<string, ProviderIcon> = {
  twilio: Phone,
  slack: IconSlack,
  discord: IconDiscord,
  "microsoft-teams": MessagesSquare,
  google: Calendar,
  zoom: Video,
  github: IconGitHub,
  gitlab: IconGitLab,
  bitbucket: IconBitbucket,
};

/** Short labels for the capability chips (mirrors the API taxonomy). */
const CAPABILITY_LABELS: Record<string, string> = {
  sms: "SMS",
  voice: "Voice",
  chat: "Chat",
  video: "Video",
  calendar: "Calendar",
  docs: "Docs",
  source: "Repos",
};

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const catalog = await getIntegrations(slug);
  const providers = catalog?.providers ?? [];

  // Group by category, preserving the catalog's order.
  const categories: { name: string; items: IntegrationCatalogEntry[] }[] = [];
  for (const p of providers) {
    let g = categories.find((c) => c.name === p.category);
    if (!g) {
      g = { name: p.category, items: [] };
      categories.push(g);
    }
    g.items.push(p);
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        title="Integrations"
        description="Connect the tools your org and projects build on. Some connect as Flagon apps; others take your own provider credentials, which Flagon uses on your behalf. Each is scoped to what it needs, and available across every product."
      />

      {categories.map((cat) => (
        <SettingsSection key={cat.name} title={cat.name}>
          <ul className="flex flex-col gap-2">
            {cat.items.map((entry) => (
              <ProviderRow key={entry.key} slug={slug} entry={entry} />
            ))}
          </ul>
        </SettingsSection>
      ))}
    </div>
  );
}

/** One catalog row. Live BYO providers link to their setup page; the rest are inert. */
function ProviderRow({ slug, entry }: { slug: string; entry: IntegrationCatalogEntry }) {
  const Icon = PROVIDER_ICONS[entry.key] ?? Plug;
  const connectable = entry.connection === "byo" && entry.status === "available";

  const inner = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-400">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm text-zinc-100">{entry.label}</p>
          <CapabilityChips capabilities={entry.capabilities} />
        </div>
        <p className="truncate text-xs text-zinc-500">{entry.summary}</p>
      </div>
      {connectable ? (
        <>
          <StatusPill entry={entry} />
          <ChevronRight className="size-4 shrink-0 text-zinc-600" />
        </>
      ) : (
        <SoonPill />
      )}
    </>
  );

  if (connectable) {
    return (
      <li>
        <Link
          href={`/${slug}/settings/integrations/${entry.key}`}
          className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/2 px-4 py-3 transition-colors hover:border-white/20"
        >
          {inner}
        </Link>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/2 px-4 py-3 opacity-80">
      {inner}
    </li>
  );
}

function CapabilityChips({ capabilities }: { capabilities: string[] }) {
  if (capabilities.length === 0) return null;
  return (
    <span className="hidden shrink-0 items-center gap-1 sm:inline-flex">
      {capabilities.map((c) => (
        <span
          key={c}
          className="rounded border border-white/10 bg-white/4 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-zinc-500 uppercase"
        >
          {CAPABILITY_LABELS[c] ?? c}
        </span>
      ))}
    </span>
  );
}

function StatusPill({ entry }: { entry: IntegrationCatalogEntry }) {
  const integration = entry.integration;
  if (!integration) {
    return (
      <span className="shrink-0 rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
        Not connected
      </span>
    );
  }
  if (integration.status === "connected") {
    return (
      <span className="shrink-0 rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-teal-300 uppercase">
        Connected
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-amber-300 uppercase">
      Needs attention
    </span>
  );
}

function SoonPill() {
  return (
    <span className="shrink-0 rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
      Soon
    </span>
  );
}
