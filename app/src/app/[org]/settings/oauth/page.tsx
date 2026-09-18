import { AppWindow } from "lucide-react";
import { Badge } from "@flagon-io/ui";
import { PageBody } from "@/components/shell/page-header";
import { SettingsCard } from "@/components/settings/settings-card";

export default function OrgOAuthClientsPage() {
  return (
    <PageBody>
      <SettingsCard
        title={
          <span className="flex items-center gap-2.5">
            OAuth clients <Badge variant="outline">Coming soon</Badge>
          </span>
        }
        description="OAuth applications that can act on this organization on a user's behalf."
        footerHint="OAuth client issuance is being built out."
      >
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline px-4 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <AppWindow className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">No OAuth clients yet.</p>
        </div>
      </SettingsCard>
    </PageBody>
  );
}
