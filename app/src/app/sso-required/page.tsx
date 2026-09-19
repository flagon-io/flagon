import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { buttonClasses } from "@flagon-io/ui";
import { getMe } from "@/lib/flagon-api";
import { listOrgProviders } from "@/lib/sso-admin";
import { SsoContinue } from "@/components/auth/sso-continue";

export const metadata = { title: "Single sign-on required - Flagon" };

// Shown when an organization requires SSO and the member hasn't signed in through
// its provider yet. Lives OUTSIDE the [org] layout so the gate can redirect here
// without looping. "Continue with SSO" sends them to the org's IdP and back.
export default async function SSORequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const { org: slug } = await searchParams;
  const org = slug ? me.orgs.find((o) => o.slug === slug) : undefined;
  const orgName = org?.name ?? "This organization";
  const providers = org ? await listOrgProviders(org.id).catch(() => []) : [];
  const providerId = providers[0]?.providerId;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-brand/12 text-brand-bright">
        <KeyRound className="size-6" />
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
        Single sign-on required
      </h1>
      <p className="mt-2 text-muted-foreground">
        {orgName} requires members to sign in through its identity provider. Continue with SSO to
        access it.
      </p>

      <div className="mt-6 w-full max-w-xs">
        {slug && providerId ? (
          <SsoContinue providerId={providerId} slug={slug} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No SSO provider is configured for this organization yet. Contact an owner.
          </p>
        )}
      </div>

      <Link
        href="/settings/organizations"
        className={buttonClasses({ variant: "ghost", size: "sm" }) + " mt-4"}
      >
        Back to your organizations
      </Link>
    </main>
  );
}
