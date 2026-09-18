import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { auth } from "@/lib/auth";
import { Badge, Button } from "@flagon-io/ui";
import { PageBody } from "@/components/shell/page-header";
import { SettingsCard } from "@/components/settings/settings-card";

export default async function BillingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <PageBody>
      <div className="space-y-6">
        <SettingsCard
          title="Plan"
          description="Upgrades, downgrades, payment methods, and invoices are handled securely in the Stripe billing portal."
          footerHint="Billing goes live soon. Flagon never stores your card details."
          footer={
            <Button size="sm" disabled>
              Manage billing
              <ExternalLink className="size-3.5" />
            </Button>
          }
        >
          <div className="flex items-center justify-between rounded-lg border border-hairline bg-muted/25 px-4 py-3.5">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">Free</p>
                <Badge variant="brand">Current</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                1 organization &middot; community support
              </p>
            </div>
            <p className="text-sm font-medium text-foreground">
              $0<span className="text-muted-foreground">/mo</span>
            </p>
          </div>
        </SettingsCard>
      </div>
    </PageBody>
  );
}
