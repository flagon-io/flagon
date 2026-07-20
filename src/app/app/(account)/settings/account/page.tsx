import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DangerZone, PasswordForm, UsernameForm } from "./account-forms";

export const metadata: Metadata = {
  title: "Account",
};

export default async function AccountSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/app/signin");

  const { user } = session;
  const username = user.displayUsername ?? user.username ?? "";

  return (
    <div className="space-y-10">
      <section>
        <h2 className="border-b border-white/5 pb-3 text-xl font-semibold tracking-tight text-zinc-100">
          Change username
        </h2>
        <UsernameForm current={username} />
      </section>

      <section>
        <h2 className="border-b border-white/5 pb-3 text-xl font-semibold tracking-tight text-zinc-100">
          Change password
        </h2>
        <PasswordForm />
      </section>

      <section>
        <h2 className="border-b border-red-500/20 pb-3 text-xl font-semibold tracking-tight text-red-400">
          Delete account
        </h2>
        <DangerZone username={username} />
      </section>
    </div>
  );
}
