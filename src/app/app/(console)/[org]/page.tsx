import { appPath } from "@/lib/urls";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Package, Plus } from "lucide-react";
import { Notice, buttonClass } from "@/components/form-ui";
import { billingEnabled, reconcileCheckoutSession } from "@/lib/billing";
import { orgBillingContext } from "@/lib/billing-periods.server";
import { PLANS, isPlanId } from "@/lib/plans";
import { ownersByProject } from "@/lib/project-ownership.server";
import { listProjects } from "@/lib/projects.server";
import { EVALUATION_METER } from "@/lib/quota";
import { usageByProject } from "@/lib/usage.server";
import { ProjectCard } from "./project-card";
import { resolveOrg } from "./resolve-org";
import { UpgradeButton } from "./upgrade-button";

type Params = {
  params: Promise<{ org: string }>;
  searchParams: Promise<{
    upgraded?: string;
    upgrade?: string;
    session_id?: string;
  }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { org } = await params;
  return { title: org };
}

/**
 * Organization root - `app.flagon.io/<slug>` (locally `/app/<slug>`).
 *
 * THIS IS THE PROJECT LIST. There is no separate overview dashboard: the one
 * that used to live here was a menu of links to things the sidebar already
 * lists, which made the first page of the app a page you had to get past.
 * Projects are what people come here to open, so projects are what it shows.
 *
 * It also remains the Stripe checkout return target, which is why the upgrade
 * notices and the reconcile live here rather than on a plain list page.
 */
export default async function OrgPage({ params, searchParams }: Params) {
  const [{ org: slug }, { upgraded, upgrade, session_id }] = await Promise.all([
    params,
    searchParams,
  ]);
  const org = await resolveOrg(slug);
  if (!org) notFound();

  let plan = (org as { plan?: string }).plan ?? "free";
  const billing = billingEnabled();

  // Checkout return: verify with Stripe directly so the upgrade applies even
  // if the webhook is delayed or (locally) not listening.
  if (billing && session_id && plan !== "pro") {
    try {
      if (await reconcileCheckoutSession(org.id, session_id)) {
        plan = "pro";
      }
    } catch {
      // Webhook remains the source of truth; the notice covers the lag.
    }
  }

  const context = await orgBillingContext(org.id);
  const [projects, owners, evaluations] = await Promise.all([
    listProjects(org.id),
    ownersByProject(org.id),
    usageByProject({
      orgId: org.id,
      window: context.current,
      meter: EVALUATION_METER,
    }),
  ]);

  return (
    <div>
      {upgraded === "1" ? (
        <Notice tone="success">
          Welcome to Pro! Your payment is processing; the plan updates within a
          few seconds of Stripe confirming it.
        </Notice>
      ) : null}
      {upgrade === "canceled" ? (
        <Notice tone="info">
          Checkout was canceled. You can upgrade to Pro whenever you&apos;re
          ready.
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
            Organization
          </p>
          <h1 className="mt-3 flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-zinc-100">
            {org.name}
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              {isPlanId(plan) ? PLANS[plan].name : plan}
            </span>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {projects.length} {projects.length === 1 ? "project" : "projects"} ·{" "}
            {org.members.length}{" "}
            {org.members.length === 1 ? "member" : "members"}
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          {billing && plan === "free" ? <UpgradeButton orgSlug={slug} /> : null}
          <Link
            href={appPath(`/${slug}/projects/new`)}
            className={`${buttonClass} inline-flex items-center gap-1.5`}
          >
            <Plus className="h-4 w-4" aria-hidden />
            New project
          </Link>
        </div>
      </div>

      {projects.length ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              orgSlug={slug}
              project={project}
              owners={owners.get(project.id) ?? []}
              evaluations={evaluations.get(project.id) ?? 0}
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 border border-dashed border-white/10 px-6 py-14 text-center">
          <Package className="mx-auto h-8 w-8 text-zinc-700" aria-hidden />
          <p className="mt-4 text-sm font-medium text-zinc-300">
            No projects yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-zinc-500">
            Projects are where your work lives. Create the first one to start
            organizing access and ownership.
          </p>
          <Link
            href={appPath(`/${slug}/projects/new`)}
            className={`${buttonClass} mx-auto mt-6 inline-flex items-center gap-1.5`}
          >
            <Plus className="h-4 w-4" aria-hidden />
            New project
          </Link>
        </div>
      )}
    </div>
  );
}
