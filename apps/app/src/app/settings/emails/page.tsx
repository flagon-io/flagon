import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listUserEmails } from "@/lib/user-emails";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { EmailsManager } from "./emails-manager";

export const metadata: Metadata = { title: "Emails · Settings" };

export default async function EmailsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { verified, error } = await searchParams;

  const emails = await listUserEmails(session.user.id);

  return (
    <div>
      <SettingsHeader
        title="Emails"
        description="Add and manage the email addresses on your account. You can sign in with any verified address."
      />
      <SettingsSection
        title="Email addresses"
        description="Your primary address is where account notifications are sent."
      >
        <EmailsManager
          emails={emails.map((e) => ({
            email: e.email,
            verified: e.verified,
            isPrimary: e.isPrimary,
          }))}
          banner={
            verified === "1"
              ? { kind: "ok", text: "Email verified." }
              : error === "invalid"
                ? { kind: "error", text: "That verification link is invalid or has expired." }
                : null
          }
        />
      </SettingsSection>
    </div>
  );
}
