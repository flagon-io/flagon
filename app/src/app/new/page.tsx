import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getMe } from "@/lib/flagon-api";
import { Card } from "@flagon-io/ui";
import { Logo } from "@/components/logo";
import { NewOrgForm } from "@/components/orgs/new-org-form";

export default async function NewOrgPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const me = await getMe().catch(() => null);
  const hasOrgs = (me?.orgs.length ?? 0) > 0;
  // Free plan includes one OWNED org; more need a payment method (billing TBD).
  const ownedCount = me?.orgs.filter((o) => o.role === "owner").length ?? 0;
  const atLimit = ownedCount >= 1;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="mb-4 size-9" />
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Create your organization
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organizations are the workspace for your projects and teammates.
          </p>
        </div>

        {atLimit ? (
          <Card className="p-6 text-center shadow-sm">
            <p className="text-sm font-medium text-foreground">
              You&apos;ve reached the free plan limit
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              The free plan includes one organization. Paid plans for additional organizations are
              coming soon.
            </p>
          </Card>
        ) : (
          <Card className="p-6 shadow-sm">
            <NewOrgForm />
          </Card>
        )}

        {hasOrgs && me && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Or go back to{" "}
            <Link href={`/${me.orgs[0].slug}`} className="font-medium text-link underline">
              {me.orgs[0].name}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
