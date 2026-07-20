import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listEmails } from "@/lib/user-emails";
import { EmailsPanel } from "./emails-panel";

export const metadata: Metadata = {
  title: "Emails",
};

export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ email_verified?: string; email_error?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/app/signin");

  const [{ email_verified, email_error }, emails] = await Promise.all([
    searchParams,
    listEmails(session.user.id),
  ]);

  return (
    <section>
      <h2 className="border-b border-white/5 pb-3 text-xl font-semibold tracking-tight text-zinc-100">
        Emails
      </h2>
      <EmailsPanel
        emails={emails.map((e) => ({
          id: e.id,
          email: e.email,
          verified: e.verified,
          primary: e.isPrimary,
        }))}
        primaryVerified={emails.some((e) => e.isPrimary && e.verified)}
        justVerified={email_verified === "1"}
        verifyError={
          email_error === "expired" || email_error === "invalid"
            ? email_error
            : null
        }
      />
    </section>
  );
}
