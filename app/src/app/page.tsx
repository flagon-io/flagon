import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await getSessionSafely();
  if (!session) redirect("/login");

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background p-4">
      <p className="text-sm text-muted-foreground">
        Signed in as{" "}
        <span className="text-foreground">{session.user.email}</span>.
      </p>
    </main>
  );
}

// Fails closed to "not logged in" on ANY backend error (e.g. the database
// isn't provisioned/migrated yet right after a first deploy) rather than
// crashing the page with a 500.
async function getSessionSafely() {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
}
