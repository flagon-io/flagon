import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import {
  Button,
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
 * Settings → Integrations. The INDEX of everything you can connect to this org.
 *
 * This page only lists and routes; configuring a provider happens on its own
 * setup page (`integrations/[provider]`), never inline here. Two kinds live
 * together, grouped by what they do: Flagon APP installs (source providers,
 * Slack, Discord) where Flagon owns the credentials and connecting is one click
 * (coming soon, shown with a disabled Connect button), and BRING-YOUR-OWN
 * providers (Twilio) where the org supplies credentials Flagon uses on their
 * behalf.
 */

type ProviderIcon = (props: { className?: string }) => React.ReactNode;

/** The source providers we're building toward. Each connects at the org level. */
const SOURCE_PROVIDERS: { label: string; icon: ProviderIcon }[] = [
  { label: "GitHub", icon: IconGitHub },
  { label: "GitLab", icon: IconGitLab },
  { label: "Bitbucket", icon: IconBitbucket },
];

/** Chat destinations that connect as Flagon apps (nothing to paste). */
const CHAT_PROVIDERS: { label: string; icon: ProviderIcon }[] = [
  { label: "Slack", icon: IconSlack },
  { label: "Discord", icon: IconDiscord },
];

/** A small per-provider icon for the BYO index rows (no brand mark of their own). */
function TwilioIcon(props: { className?: string }) {
  return <Phone {...props} />;
}
const PROVIDER_ICONS: Record<string, ProviderIcon> = {
  twilio: TwilioIcon,
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
  const notificationProviders = providers.filter(
    (p) => p.category === "Notifications",
  );

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        title="Integrations"
        description="Connect the tools your org and projects build on. Some connect as Flagon apps; others take your own provider credentials, which Flagon uses on your behalf. Each is scoped to what it needs."
      />

      {/* Source providers first: the connection most orgs reach for, since every
          project builds on a repository. Flagon-app install, coming soon. */}
      <SettingsSection
        title="Source providers"
        description="Connect a source provider at the org level so your projects can build on its repositories."
        action={<SoonPill />}
      >
        <ul className="flex flex-col gap-2">
          {SOURCE_PROVIDERS.map((p) => (
            <AppInstallRow key={p.label} label={p.label} icon={p.icon} />
          ))}
        </ul>
      </SettingsSection>

      {/* Bring-your-own providers: each routes to its own setup page. */}
      {notificationProviders.length > 0 ? (
        <SettingsSection
          title="Notifications"
          description="Bring your own provider to deliver pages and alerts through your account."
        >
          <ul className="flex flex-col gap-2">
            {notificationProviders.map((entry) => (
              <ProviderRow key={entry.key} slug={slug} entry={entry} />
            ))}
          </ul>
        </SettingsSection>
      ) : null}

      <SettingsSection
        title="Chat notifications"
        description="Send flag changes, experiment results, and incident pages to Slack or Discord. They connect as Flagon apps, so there's nothing to paste."
        action={<SoonPill />}
      >
        <ul className="flex flex-col gap-2">
          {CHAT_PROVIDERS.map((p) => (
            <AppInstallRow key={p.label} label={p.label} icon={p.icon} />
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}

/**
 * A Flagon-app provider that isn't live yet: shown with a disabled Connect button
 * as a placeholder for the one-click flow to come.
 */
function AppInstallRow({ label, icon: Icon }: { label: string; icon: ProviderIcon }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/2 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-400">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm text-zinc-100">{label}</span>
      <Button variant="secondary" size="sm" disabled>
        Connect
      </Button>
    </li>
  );
}

/** One linked index row for a configurable provider. Routes to its setup page. */
function ProviderRow({
  slug,
  entry,
}: {
  slug: string;
  entry: IntegrationCatalogEntry;
}) {
  const Icon = PROVIDER_ICONS[entry.key] ?? TwilioIcon;
  return (
    <li>
      <Link
        href={`/${slug}/integrations/${entry.key}`}
        className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/2 px-4 py-3 transition-colors hover:border-white/20"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-400">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-zinc-100">{entry.label}</p>
          <p className="truncate text-xs text-zinc-500">{entry.summary}</p>
        </div>
        <StatusPill entry={entry} />
        <ChevronRight className="size-4 shrink-0 text-zinc-600" />
      </Link>
    </li>
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
    <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
      Soon
    </span>
  );
}
