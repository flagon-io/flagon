import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, getSession } from "@/lib/auth";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { ChangePasswordForm } from "./change-password-form";
import { SessionsList } from "./sessions-list";

export const metadata: Metadata = { title: "Security · Settings" };

export default async function SecuritySettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const sessions = await auth.api.listSessions({ headers: await headers() });

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
        title="Active sessions"
        description="Devices currently signed in. Revoke any you do not recognize."
      >
        <SessionsList
          sessions={sessions.map(
            (s: {
              token: string;
              createdAt: Date;
              userAgent?: string | null;
              ipAddress?: string | null;
            }) => ({
              token: s.token,
              createdAt: s.createdAt.toISOString(),
              userAgent: s.userAgent ?? null,
              ipAddress: s.ipAddress ?? null,
              current: s.token === session.session.token,
            }),
          )}
        />
      </SettingsSection>
    </div>
  );
}
