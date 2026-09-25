import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SettingsHeader, SettingsSubheader } from "@/components/settings/section";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { TwoFactorSetup } from "@/components/settings/two-factor-setup";

export default async function SecuritySettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const twoFactorEnabled = Boolean((session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled);

  return (
    <div>
      <SettingsHeader title="Password and authentication" />

      <div className="space-y-10">
        <section className="space-y-4">
          <SettingsSubheader
            title="Change password"
            description="Changing your password signs out your other sessions."
          />
          <ChangePasswordForm />
        </section>

        <section className="space-y-4">
          <SettingsSubheader
            title="Two-factor authentication"
            description="Add a second step to your sign-in for extra protection."
          />
          <TwoFactorSetup initialEnabled={twoFactorEnabled} />
        </section>
      </div>
    </div>
  );
}
