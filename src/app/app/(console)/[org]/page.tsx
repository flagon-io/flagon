import { appPath } from "@/lib/urls";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { billingEnabled, reconcileCheckoutSession } from "@/lib/billing";
import { PLANS, isPlanId } from "@/lib/plans";
import { Notice } from "@/components/form-ui";
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

/** Organization dashboard - `app.flagon.io/<slug>` (locally `/app/<slug>`). */
export default async function OrgPage({ params, searchParams }: Params) {
  const [{ org: slug }, { upgraded, upgrade, session_id }] = await Promise.all(
    [params, searchParams],
  );
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

  return (
    <div>
      {upgraded === "1" ? (
        <Notice tone="success">
          Welcome to Pro! Your payment is processing; the plan updates within
          a few seconds of Stripe confirming it.
        </Notice>
      ) : null}
      {upgrade === "canceled" ? (
        <Notice tone="info">
          Checkout was canceled. You can upgrade to Pro whenever you&apos;re
          ready.
        </Notice>
      ) : null}

      <div className="flex items-start justify-between gap-4">
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
            /{org.slug} · {org.members.length}{" "}
            {org.members.length === 1 ? "member" : "members"}
          </p>
        </div>
        {billing && plan === "free" ? (
          <div className="pt-1">
            <UpgradeButton orgSlug={slug} />
          </div>
        ) : null}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href={appPath(`/${slug}/projects`)}
          className="border border-white/10 p-4 text-sm transition hover:border-white/20 hover:bg-white/2"
        >
          <div className="font-medium text-zinc-200">Projects</div>
          <div className="mt-1 text-zinc-500">
            Where your work lives; products attach here.
          </div>
        </Link>
        <Link
          href={appPath(`/${slug}/teams`)}
          className="border border-white/10 p-4 text-sm transition hover:border-white/20 hover:bg-white/2"
        >
          <div className="font-medium text-zinc-200">Teams</div>
          <div className="mt-1 text-zinc-500">
            Group people to share projects and products.
          </div>
        </Link>
        {["Feature Flags", "Members"].map((section) => (
          <div
            key={section}
            className="border border-white/10 p-4 text-sm text-zinc-400"
          >
            <div className="font-medium text-zinc-200">{section}</div>
            <div className="mt-1 text-zinc-500">Coming soon</div>
          </div>
        ))}
      </div>
    </div>
  );
}
