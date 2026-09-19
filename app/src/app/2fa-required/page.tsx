import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { buttonClasses } from "@flagon-io/ui";
import { getMe } from "@/lib/flagon-api";

export const metadata = { title: "Two-factor required - Flagon" };

// Shown when an organization requires 2FA and the member hasn't enabled it yet.
// It lives OUTSIDE the [org] layout so the org gate can redirect here without a
// loop. Enabling 2FA happens on the personal, un-gated /settings/security page.
export default async function TwoFactorRequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  const { org: slug } = await searchParams;
  const org = slug ? me.orgs.find((o) => o.slug === slug) : undefined;
  const orgName = org?.name ?? "This organization";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-brand/12 text-brand-bright">
        <ShieldCheck className="size-6" />
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">
        Two-factor authentication required
      </h1>
      <p className="mt-2 text-muted-foreground">
        {orgName} requires every member to have two-factor authentication enabled. Set it up to
        continue.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Link href="/settings/security" className={buttonClasses()}>
          Set up two-factor
        </Link>
        {slug && (
          <Link href={`/${slug}`} className={buttonClasses({ variant: "outline" })}>
            I&rsquo;ve enabled it - continue
          </Link>
        )}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Once enabled, you&rsquo;ll be able to access {org ? orgName : "the organization"} again.
      </p>
    </main>
  );
}
