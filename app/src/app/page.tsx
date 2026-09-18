import { redirect } from "next/navigation";
import { getMe, type Me } from "@/lib/flagon-api";

export default async function Home() {
  const me = await getMeSafely();
  if (!me) redirect("/login");
  if (me.orgs.length === 0) redirect("/new");
  redirect(`/${me.orgs[0].slug}`);
}

// Fail closed to "not logged in" on any backend error (e.g. the API/database
// isn't reachable yet) rather than crashing the entry point with a 500.
async function getMeSafely(): Promise<Me | null> {
  try {
    return await getMe();
  } catch {
    return null;
  }
}
