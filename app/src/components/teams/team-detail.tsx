"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@flagon-io/ui";
import { PageBreadcrumb } from "@/components/shell/page-breadcrumb";
import type { Team, TeamMember, TeamProject } from "@/lib/api/types";
import { TeamMembersTab } from "./team-members-tab";
import { TeamProjectsTab } from "./team-projects-tab";
import { TeamSettingsTab } from "./team-settings-tab";
import { usePagedList } from "./use-paged-list";

export function TeamDetail({
  slug,
  teamSlug,
  initialTeam,
  orgRole,
  currentUserId,
}: {
  slug: string;
  teamSlug: string;
  initialTeam: Team;
  orgRole: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const orgAdmin = orgRole === "owner" || orgRole === "admin";

  const [team, setTeam] = useState<Team>(initialTeam);

  const base = `/api/orgs/${encodeURIComponent(slug)}/teams/${encodeURIComponent(teamSlug)}`;
  const members = usePagedList<TeamMember>(`${base}/members`, "Couldn't load the team's members.");
  const projects = usePagedList<TeamProject>(`${base}/projects`, "Couldn't load the team's projects.");

  // You can manage the team if you're an org owner/admin or a maintainer of it -
  // the API enforces the same rule. Disbanding is reserved for org owners/admins.
  const myRole = members.items.find((m) => m.user_id === currentUserId)?.role;
  const canManage = orgAdmin || myRole === "maintainer";
  const canDelete = orgAdmin;

  return (
    <div className="space-y-6">
      <PageBreadcrumb label={team.name} />
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{team.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {team.description || <span className="font-mono text-xs">@{team.slug}</span>}
        </p>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members" className="gap-1.5">
            Members
            {!members.loading && !members.error && (
              <Badge variant="secondary">{members.items.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-1.5">
            Projects
            {!projects.loading && !projects.error && (
              <Badge variant="secondary">{projects.items.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-6">
          <TeamMembersTab
            base={base}
            members={members.items}
            loading={members.loading}
            loadError={members.error}
            onRetry={members.retry}
            next={members.next}
            onLoadMore={members.loadMore}
            canManage={canManage}
            currentUserId={currentUserId}
            reload={members.reload}
          />
        </TabsContent>

        <TabsContent value="projects" className="mt-6">
          <TeamProjectsTab
            slug={slug}
            teamSlug={teamSlug}
            projects={projects.items}
            loading={projects.loading}
            loadError={projects.error}
            onRetry={projects.retry}
            next={projects.next}
            onLoadMore={projects.loadMore}
            canManage={canManage}
            reload={projects.reload}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <TeamSettingsTab
            base={base}
            team={team}
            canManage={canManage}
            canDelete={canDelete}
            onRenamed={(next) => {
              if (next.slug !== teamSlug) router.push(`/${slug}/teams/${next.slug}`);
              else setTeam(next);
            }}
            onDeleted={() => router.push(`/${slug}/teams`)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
