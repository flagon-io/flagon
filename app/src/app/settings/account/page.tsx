import Link from "next/link";
import { requireMe } from "@/lib/org-context";
import { SettingsHeader, SettingsSubheader } from "@/components/settings/section";
import { UsernameForm } from "@/components/settings/username-form";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";

export default async function AccountPage() {
  const { session, me } = await requireMe();

  const u = session.user as {
    email: string;
    username?: string | null;
    displayUsername?: string | null;
  };
  const username = u.displayUsername || u.username || "";

  // No fallback: a failed /me must not read as "owns nothing" and offer account
  // deletion to someone who still owns organizations.
  const ownedCount = me.orgs.filter((o) => o.role === "owner").length;

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
