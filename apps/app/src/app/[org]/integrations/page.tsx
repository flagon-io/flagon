import { notFound, redirect } from "next/navigation";
import { Bell, CircleDot, LineChart } from "lucide-react";
import { getSession } from "@/lib/auth";
import { PROJECTS_ENABLED } from "@/lib/features";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listGithubInstallations } from "@/lib/projects-api";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { SourceProviders } from "./source-providers";

/**
 * Settings → Integrations. The hub for connecting outside tools to this org.
 * Each integration is scoped to a purpose: Source providers (the one live today)
 * grants repository access for Projects and nothing more. Other categories are
 * placeholders — and a future GitHub-powered integration for a different purpose
 * would install its own app and appear as its own entry, separate from this one.
 */
export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!PROJECTS_ENABLED) notFound();

  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const installations = await listGithubInstallations(slug);

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        title="Integrations"
        description="Connect the tools your org and projects build on. Each integration is scoped to what it needs."
      />

      <SourceProviders
        slug={slug}
        installations={installations}
        canManage={canManageOrg(membership.role)}
      />

      {/* Placeholders. These stake out the shape: integrations are grouped by
          what they do, not by vendor, so a provider can appear in more than one
          category through separate, purpose-scoped apps. */}
      <ComingSoonSection
        icon={<Bell className="h-4 w-4" />}
        title="Notifications"
        description="Send flag changes and events to Slack, Discord, or a webhook."
      />
      <ComingSoonSection
        icon={<CircleDot className="h-4 w-4" />}
        title="Issue tracking"
        description="Link work in Linear, Jira, or GitHub Issues. A separate app, scoped to issues."
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
    <SettingsSection
      title={title}
      description={description}
      action={
        <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
          Soon
        </span>
      }
    >
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-400">
          {icon}
        </span>
        <span>Not available yet. We&apos;ll light this up as we build it out.</span>
      </div>
    </SettingsSection>
  );
}
