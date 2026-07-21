import { appPath } from "@/lib/urls";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { PLANS, isPlanId } from "@/lib/plans";
import { buttonClass } from "@/components/form-ui";

export const metadata: Metadata = {
  title: "Organizations",
};

/** Settings > Organizations: every org you belong to, with its plan. */
export default async function OrganizationsSettingsPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect(appPath("/signin"));

  const orgs = await auth.api.listOrganizations({ headers: requestHeaders });

  return (
    <section>
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
          Organizations
        </h2>
        <Link
          href={appPath("/new")}
          className={`${buttonClass} inline-flex items-center gap-1.5`}
        >
          <Plus className="h-4 w-4" aria-hidden />
          New organization
        </Link>
      </div>

      {orgs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-white/10 p-8 text-center">
          <Building2 className="mx-auto h-8 w-8 text-zinc-600" aria-hidden />
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            You don&apos;t belong to any organizations yet.
          </p>
          <Link
            href={appPath("/new")}
            className="mt-1 inline-block text-sm font-medium text-teal-400 transition hover:text-teal-300"
          >
            Create your first organization
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {orgs.map((org) => (
            <li key={org.id}>
              <Link
                href={appPath(`/${org.slug}`)}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/2 px-4 py-3 transition hover:border-teal-500/40 hover:bg-white/3"
              >
                <span
                  aria-hidden
                  className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-500/15 text-teal-300"
                >
                  <Building2 className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-100">
                    {org.name}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    /{org.slug}
                  </span>
                </span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                  {(() => {
                    const plan = (org as { plan?: string }).plan ?? "free";
                    return isPlanId(plan) ? PLANS[plan].name : plan;
                  })()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
