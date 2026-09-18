import Link from "next/link";
import { Building2, Plus, Settings2 } from "lucide-react";
import { Badge, Button, Card } from "@flagon-io/ui";
import { getMe } from "@/lib/flagon-api";
import { LeaveOrgButton } from "@/components/settings/leave-org-button";
import { SettingsHeader } from "@/components/settings/section";

export default async function OrganizationsPage() {
  const me = await getMe().catch(() => null);
  const orgs = me?.orgs ?? [];
  // Free plan includes one OWNED org; more require a payment method.
  const owned = orgs.filter((o) => o.role === "owner").length;
  const atLimit = owned >= 1;

  return (
    <div>
      <SettingsHeader
        title="Organizations"
        description="Organizations you belong to and your role in each."
        actions={
          !atLimit && (
            <Button asChild size="sm">
              <Link href="/new">
                <Plus className="size-4" />
                New organization
              </Link>
            </Button>
          )
        }
      />

      {orgs.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            You&apos;re not a member of any organization yet.
          </p>
          <Button asChild className="mt-4">
            <Link href="/new">Create organization</Link>
          </Button>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-hairline">
            {orgs.map((o) => {
              const isOwner = o.role === "owner";
              return (
                <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand/12 text-brand-bright">
                    <Building2 className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${o.slug}`}
                      className="truncate text-sm font-medium text-foreground outline-none hover:text-link focus-visible:text-link"
                    >
                      {o.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">/{o.slug}</p>
                  </div>
                  <Badge variant={isOwner ? "brand" : "outline"} className="capitalize">
                    {o.role}
                  </Badge>
                  {isOwner && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/${o.slug}/settings`}>
                        <Settings2 className="size-4" />
                        Settings
                      </Link>
                    </Button>
                  )}
                  <LeaveOrgButton slug={o.slug} name={o.name} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {orgs.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {orgs.length} {orgs.length === 1 ? "organization" : "organizations"}
        </p>
      )}

      {atLimit && (
        <p className="mt-4 text-sm text-muted-foreground">
          The free plan includes one organization. Paid plans for additional organizations are
          coming soon.
        </p>
      )}
    </div>
  );
}
