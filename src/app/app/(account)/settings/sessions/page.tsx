import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SessionsList } from "./sessions-list";

export const metadata: Metadata = {
  title: "Sessions",
};

export default async function SessionsSettingsPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/app/signin");

  const sessions = await auth.api.listSessions({ headers: requestHeaders });

  return (
    <section>
      <h2 className="border-b border-white/5 pb-3 text-xl font-semibold tracking-tight text-zinc-100">
        Sessions
      </h2>
      <SessionsList
        currentToken={session.session.token}
        sessions={sessions.map((s) => ({
          token: s.token,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          ipAddress: s.ipAddress ?? null,
          userAgent: s.userAgent ?? null,
        }))}
      />
    </section>
  );
}
