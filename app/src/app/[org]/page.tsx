import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { Boxes, Users, Plus, ArrowRight, Gauge, KeyRound, Rocket } from "lucide-react";
import { auth } from "@/lib/auth";
import { getMe, listProjects, type Project } from "@/lib/flagon-api";
import { AgentLauncher } from "@/components/agent/agent-launcher";

function repoHost(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export default async function OrgDashboard({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const [me, session] = await Promise.all([
    getMe(),
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!me) redirect("/login");
  const org = me.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/");

  const canWrite = org.role !== "viewer";
  const projects = await listProjects(slug).catch(() => [] as Project[]);
  const name = session?.user?.name ?? null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 lg:px-8">
      <AgentLauncher name={name} />

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Real resources. */}
        <Panel
          className="lg:col-span-2"
          icon={<Boxes className="size-4" />}
          title="Projects"
          count={projects.length}
          action={
            canWrite
              ? { label: "New", href: `/${slug}/projects/new`, icon: <Plus className="size-3.5" /> }
              : undefined
          }
          footer={projects.length > 0 ? { label: "All projects", href: `/${slug}/projects` } : undefined}
        >
          {projects.length === 0 ? (
            <Empty
              text="No projects yet."
              cta={canWrite ? { label: "Create your first project", href: `/${slug}/projects/new` } : undefined}
            />
          ) : (
            <ul className="divide-y divide-hairline">
              {projects.slice(0, 5).map((p) => {
                const host = repoHost(p.repository_url);
                return (
                  <li key={p.id}>
                    <Link
                      href={`/${slug}/projects/${p.slug}`}
                      className="group flex items-center gap-3 px-4 py-2.5 outline-none transition-colors hover:bg-panel focus-visible:bg-panel"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Boxes className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                        {host && <span className="block truncate text-xs text-muted-foreground">{host}</span>}
                      </span>
                      <ArrowRight className="size-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Usage at a glance (metering ships later). */}
        <Panel
          icon={<Gauge className="size-4" />}
          title="Usage"
          footer={{ label: "View usage", href: `/${slug}/usage` }}
        >
          <div className="px-4 py-4">
            <p className="text-xs text-muted-foreground">Included credit</p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">
              $0.00 <span className="text-sm font-normal text-muted-foreground">/ $20.00</span>
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[4%] rounded-full bg-brand" />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Per-org metering is coming soon.</p>
          </div>
        </Panel>
      </div>

      {/* Quick actions. */}
      <div className="mt-8">
        <h2 className="mb-3 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
          Get started
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ActionCard href={`/${slug}/projects/new`} icon={<Boxes className="size-4" />} title="Create a project" body="A new deployable unit." show={canWrite} />
          <ActionCard href={`/${slug}/settings/members`} icon={<Users className="size-4" />} title="Invite teammates" body="Add people to this org." show={canWrite} />
          <ActionCard href={`/${slug}/settings/tokens/new`} icon={<KeyRound className="size-4" />} title="Create a token" body="For CI and the API." show={canWrite} />
          <ActionCard href={`/${slug}/deployments`} icon={<Rocket className="size-4" />} title="Deployments" body="Track builds & rollouts." show />
        </div>
      </div>
    </div>
  );
}

function Panel({
  icon,
  title,
  count,
  action,
  footer,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  action?: { label: string; href: string; icon?: React.ReactNode };
  footer?: { label: string; href: string };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-xl border border-hairline bg-card ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {count !== undefined && (
            <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">{count}</span>
          )}
        </div>
        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {action.icon}
            {action.label}
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
      {footer && (
        <Link
          href={footer.href}
          className="flex items-center gap-1 border-t border-hairline px-4 py-2.5 text-xs font-medium text-link outline-none transition-colors hover:bg-panel focus-visible:bg-panel"
        >
          {footer.label}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </section>
  );
}

function ActionCard({
  href,
  icon,
  title,
  body,
  show,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <Link
      href={href}
      className="group rounded-xl border border-hairline bg-card p-4 outline-none transition-colors hover:border-brand/30 hover:bg-panel focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand/12 text-brand-bright">
        {icon}
      </span>
      <p className="mt-3 flex items-center gap-1 text-sm font-medium text-foreground">
        {title}
        <ArrowRight className="size-3.5 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
    </Link>
  );
}

function Empty({ text, cta }: { text: string; cta?: { label: string; href: string } }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      {cta && (
        <Link href={cta.href} className="mt-1.5 inline-block text-sm font-medium text-link hover:underline">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
