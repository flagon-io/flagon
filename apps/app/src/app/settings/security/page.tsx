import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, getSessions } from "@/lib/auth";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { ChangePasswordForm } from "./change-password-form";
import { SessionsList } from "./sessions-list";
import { TwoFactorEnrollment } from "./two-factor-enrollment";

export const metadata: Metadata = { title: "Security · Settings" };

export default async function SecuritySettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const sessions = await getSessions();

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        title="Security"
        description="Your password and the devices signed in to your account."
      />

      <SettingsSection
        title="Change password"
        description="Choose a strong password you do not use anywhere else."
      >
        <ChangePasswordForm />
      </SettingsSection>

      <SettingsSection
        title="Two-factor authentication"
        description="Require a code from an authenticator app when you sign in."
      >
        <TwoFactorEnrollment
          enabled={session.user.twoFactorEnabled ?? false}
        />
      </SettingsSection>

      <SettingsSection
        title="Active sessions"
        description="Devices currently signed in. Revoke any you do not recognize."
      >
        <SessionsList
          sessions={sessions.map((s) => ({
            token: s.token,
            // listSessions returns Date objects (in-process); the row renders an
            // ISO string, matching what the old over-HTTP path produced.
            createdAt: new Date(s.createdAt).toISOString(),
            userAgent: s.userAgent ?? null,
            ipAddress: s.ipAddress ?? null,
            current: s.token === session.session.token,
          }))}
        />
      </SettingsSection>
    </div>
  );
}
