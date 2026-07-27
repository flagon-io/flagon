import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile · Settings" };

export default async function ProfileSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div>
      <SettingsHeader
        title="Profile"
        description="Your public identity across Flagon."
      />
      <SettingsSection
        title="Public profile"
        description="Your name and username. Your username identifies you to teammates."
      >
        <ProfileForm
          initialName={session.user.name}
          initialUsername={session.user.displayUsername ?? session.user.username ?? ""}
        />
      </SettingsSection>
    </div>
  );
}
