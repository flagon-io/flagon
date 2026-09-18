import { redirect } from "next/navigation";

// The dashboard is now org-scoped at /<org>. Keep this path working by sending
// people to the org resolver at the root.
export default function DashboardPage() {
  redirect("/");
}
