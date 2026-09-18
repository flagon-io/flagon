import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listUserEmails } from "@/lib/user-emails";
import { SettingsHeader } from "@/components/settings/section";
import { ProfileForm } from "@/components/settings/profile-form";

export default async function PublicProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const u = session.user as {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    username?: string | null;
    displayUsername?: string | null;
    bio?: string | null;
    pronouns?: string | null;
    websiteUrl?: string | null;
    company?: string | null;
    location?: string | null;
    socialLinks?: string | null;
    publicEmail?: string | null;
  };

  const emails = await listUserEmails(u.id).catch(() => []);
  const verifiedEmails = emails.filter((e) => e.verified).map((e) => e.email);

  let social: string[] = [];
  try {
    const parsed = JSON.parse(u.socialLinks || "[]");
    if (Array.isArray(parsed)) social = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* ignore malformed */
  }

  return (
    <div>
      <SettingsHeader title="Public profile" />
      <ProfileForm
        userId={u.id}
        initial={{
          name: u.name ?? "",
          bio: u.bio ?? "",
          pronouns: u.pronouns ?? "",
          websiteUrl: u.websiteUrl ?? "",
          company: u.company ?? "",
          location: u.location ?? "",
          social,
          publicEmail: u.publicEmail ?? "",
        }}
        account={{
          name: u.name ?? null,
          username: u.displayUsername || u.username || null,
          email: u.email,
          image: u.image ?? null,
        }}
        verifiedEmails={verifiedEmails}
      />
    </div>
  );
}
