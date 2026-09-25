import { redirect } from "next/navigation";
import { Badge, Switch } from "@flagon-io/ui";
import { getSession } from "@/lib/session";
import { listUserEmails } from "@/lib/user-emails";
import { EmailsManager } from "@/components/settings/emails-manager";

export default async function EmailSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Read straight from the auth DB; a failure throws to settings/error.tsx rather
  // than rendering as "no email addresses".
  const emails = (await listUserEmails(session.user.id)).map((e) => ({
    ...e,
    createdAt: new Date(e.createdAt).toISOString(),
  }));

  return (
    <div className="space-y-6">
      <EmailsManager initialEmails={emails} />

      <section className="space-y-3 border-t border-hairline pt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Keep my email addresses private</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Hide your emails from your public profile and use a no-reply address for Git
              operations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Coming soon</Badge>
            <Switch disabled aria-label="Keep my email addresses private" />
          </div>
        </div>
      </section>
    </div>
  );
}
