import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe } from "@/lib/flagon-api";
import { SettingsHeader, SettingsSubheader } from "@/components/settings/section";
import { UsernameForm } from "@/components/settings/username-form";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const u = session.user as {
    email: string;
    username?: string | null;
    displayUsername?: string | null;
  };
  const username = u.displayUsername || u.username || "";

  const me = await getMe().catch(() => null);
  const ownedCount = me?.orgs.filter((o) => o.role === "owner").length ?? 0;

  return (
    <div>
      <SettingsHeader title="Account" />
      <div className="space-y-10">
        <section className="space-y-4">
          <SettingsSubheader
            title="Change username"
            description="Your username identifies you across Flagon. Changing it can break existing links."
          />
          <UsernameForm current={username} />
        </section>

        <section className="space-y-3">
          <SettingsSubheader title="Delete account" />
          {ownedCount > 0 ? (
            <div className="rounded-lg border border-hairline bg-panel/40 px-4 py-4">
              <p className="text-sm text-foreground">
                You own {ownedCount} organization{ownedCount > 1 ? "s" : ""}. Leave or delete{" "}
                {ownedCount > 1 ? "them" : "it"} before deleting your account.
              </p>
              <Link
                href="/settings/organizations"
                className="mt-1 inline-block text-sm font-medium text-link underline underline-offset-2"
              >
                Manage organizations
              </Link>
            </div>
          ) : (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-4">
              <p className="text-sm text-foreground">
                Deactivate your personal account and sign out everywhere. This is reversible -
                support can restore it if it was a mistake.
              </p>
              <div className="mt-3">
                <DeleteAccountButton confirmWord={username || u.email} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
