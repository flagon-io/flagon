import { redirect } from "next/navigation";
import { getMe } from "@/lib/flagon-api";
import { CreateOrgForm } from "@/components/orgs/create-org-form";

export default async function DashboardPage() {
  const me = await getMe();
  if (!me) redirect("/login");

  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-bold">Organizations</h1>
        <p className="text-sm text-black/60">Signed in as {me.user.email}</p>
      </div>

      {me.orgs.length === 0 ? (
        <p className="text-sm text-black/60">
          No organizations yet. Create one to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {me.orgs.map((org) => (
            <li
              key={org.id}
              className="flex items-center justify-between rounded-lg border border-black/10 bg-white px-4 py-3 text-sm"
            >
              <span className="font-medium">{org.name}</span>
              <span className="text-xs text-black/50">
                {org.slug} &middot; {org.role}
              </span>
            </li>
          ))}
        </ul>
      )}

      <CreateOrgForm />
    </main>
  );
}
