import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { GitCommitHorizontal } from "lucide-react";
import { auth } from "@/lib/auth";
import { Badge, Card } from "@flagon-io/ui";
import { PageHeader, PageBody } from "@/components/shell/page-header";

// Clearly inert preview rows, so the surface reads as "this is what lands here"
// without pretending to be live data. Mirrors the Usage page treatment.
const PREVIEW = [
  { env: "Production", branch: "main", status: "Ready", tone: "bg-brand" },
  { env: "Preview", branch: "feat/checkout", status: "Building", tone: "bg-muted-foreground" },
  { env: "Preview", branch: "fix/nav-focus", status: "Ready", tone: "bg-brand" },
  { env: "Production", branch: "main", status: "Ready", tone: "bg-brand" },
];

export default async function DeploymentsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <>
      <PageHeader
        title={
          <>
            Deployments
            <Badge variant="outline">Coming soon</Badge>
          </>
        }
        description="Builds and rollouts across your environments."
      />
      <PageBody>
        <div
          aria-hidden
          className="pointer-events-none space-y-3 opacity-45 blur-[0.4px] select-none"
        >
          <Card className="overflow-hidden">
            <div className="flex h-11 items-center gap-3 border-b border-hairline bg-muted/25 px-4 text-xs font-medium text-muted-foreground">
              <span className="flex-1">Deployment</span>
              <span className="hidden w-28 shrink-0 sm:block">Environment</span>
              <span className="w-24 shrink-0">Status</span>
            </div>
            <ul className="divide-y divide-hairline">
              {PREVIEW.map((d, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <GitCommitHorizontal className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{d.branch}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.env === "Production" ? "Promoted to production" : "Preview build"}
                    </p>
                  </div>
                  <div className="hidden w-28 shrink-0 text-sm text-muted-foreground sm:block">
                    {d.env}
                  </div>
                  <div className="flex w-24 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                    <span className={`size-1.5 rounded-full ${d.tone}`} />
                    {d.status}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Deployments aren&rsquo;t available yet. Once your projects deploy, builds and rollouts
          will show up here.
        </p>
      </PageBody>
    </>
  );
}
