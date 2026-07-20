import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Public profile",
};

export default async function PublicProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/app/signin");

  return (
    <section>
      <h2 className="border-b border-white/5 pb-3 text-xl font-semibold tracking-tight text-zinc-100">
        Public profile
      </h2>
      <ProfileForm initialName={session.user.name} />
    </section>
  );
}
