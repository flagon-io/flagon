import { redirect } from "next/navigation";
import { requireMe } from "@/lib/org-context";

// The entry resolver. Signed out -> /login (inside requireMe). An API outage is
// NOT treated as "signed out": it throws to the root error boundary, so a
// signed-in user sees a retryable error instead of being bounced to a login
// page that can't help them.
export default async function Home() {
  const { me } = await requireMe();
  if (me.orgs.length === 0) redirect("/new");
  redirect(`/${me.orgs[0].slug}`);
}
