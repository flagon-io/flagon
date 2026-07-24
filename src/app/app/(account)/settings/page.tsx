import type { Metadata } from "next";
import { requireSession } from "@/lib/auth-guards.server";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Public profile",
};

export default async function PublicProfilePage() {
  const session = await requireSession();

  return (
    <section>
      <h2 className="border-b border-white/5 pb-3 text-xl font-semibold tracking-tight text-zinc-100">
        Public profile
      </h2>
      <ProfileForm initialName={session.user.name} />
    </section>
  );
}
