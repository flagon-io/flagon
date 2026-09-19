import type { ReactNode } from "react";
import { PageBody } from "@/components/shell/page-header";
import { ProjectSettingsNav } from "@/components/projects/project-settings-nav";

// Shared chrome for a project's Settings area: the sub-navigation (General,
// Access, ...) beside the active section. Auth for each section lives in its
// own page.
export default async function ProjectSettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string; project: string }>;
}) {
  const { org, project } = await params;
  const base = `/${org}/projects/${project}`;
  return (
    <PageBody>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <aside className="sm:pt-1">
          <ProjectSettingsNav base={base} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </PageBody>
  );
}
