import { redirect } from "next/navigation";
import { Bell, LineChart } from "lucide-react";
import { IconBitbucket, IconGitHub, IconGitLab } from "@flagon/design";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";

/**
 * Settings → Integrations. The hub for connecting outside tools to this org.
 * Integrations are grouped by what they do, not by vendor, so a provider can
 * appear in more than one category through separate, purpose-scoped apps. Every
 * category is coming soon today; each lights up as we build it out.
 */

type ProviderIcon = (props: { className?: string }) => React.ReactNode;

/** The source providers we're building toward. Each connects at the org level. */
const SOURCE_PROVIDERS: { label: string; icon: ProviderIcon }[] = [
  { label: "GitHub", icon: IconGitHub },
  { label: "GitLab", icon: IconGitLab },
  { label: "Bitbucket", icon: IconBitbucket },
];

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

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        title="Integrations"
        description="Connect the tools your org and projects build on. Each integration is scoped to what it needs."
      />

      <SettingsSection
        title="Source providers"
        description="Connect a source provider at the org level so your projects can build on its repositories."
        action={<SoonPill />}
      >
        <ul className="grid gap-2 sm:grid-cols-3">
          {SOURCE_PROVIDERS.map((p) => {
            const Icon = p.icon;
            return (
              <li
                key={p.label}
                className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-white/2 px-3 py-2.5"
              >
                <Icon className="h-4.5 w-4.5 shrink-0 text-zinc-400" />
                <span className="flex-1 text-sm text-zinc-200">{p.label}</span>
                <SoonPill />
              </li>
            );
          })}
        </ul>
      </SettingsSection>

      <ComingSoonSection
        icon={<Bell className="h-4 w-4" />}
        title="Notifications"
        description="Send flag changes and events to Slack, Discord, or a webhook."
      />
      <ComingSoonSection
        icon={<LineChart className="h-4 w-4" />}
        title="Observability"
        description="Stream metrics and exposures to Datadog, Sentry, or your own sink."
      />
    </div>
  );
}

function ComingSoonSection({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <SettingsSection title={title} description={description} action={<SoonPill />}>
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-400">
          {icon}
        </span>
        <span>Not available yet. We&apos;ll light this up as we build it out.</span>
      </div>
    </SettingsSection>
  );
}

function SoonPill() {
  return (
    <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
      Soon
    </span>
  );
}
