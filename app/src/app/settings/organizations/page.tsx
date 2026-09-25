import Link from "next/link";
import { Building2, Plus, Settings2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@flagon-io/ui";
import { requireMe } from "@/lib/org-context";
import { listDeletedOrgs, type DeletedOrg } from "@/lib/flagon-api";
import { LeaveOrgButton } from "@/components/settings/leave-org-button";
import { DeletedOrgsList } from "@/components/settings/deleted-orgs-list";
import { SettingsHeader } from "@/components/settings/section";
import { TableShell } from "@/components/shared/list-states";

export default async function OrganizationsPage() {
  // No fallback: a failed /me throws to settings/error.tsx instead of reading as
  // "you're not a member of any organization".
  const { me } = await requireMe();
  const orgs = me.orgs;
  // Free plan includes one OWNED org; more require a payment method.
  const owned = orgs.filter((o) => o.role === "owner").length;
  const atLimit = owned >= 1;
  // The recently deleted archive is secondary: if it fails to load, say so in
  // place rather than failing the whole page (or pretending it is empty).
  let deleted: DeletedOrg[] = [];
  let deletedError = false;
  try {
    deleted = await listDeletedOrgs();
  } catch (e) {
    console.error("[settings/organizations] deleted orgs", e);
    deletedError = true;
  }

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
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4">Organization</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="px-4 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((o) => {
                const isOwner = o.role === "owner";
                return (
                  <TableRow key={o.id}>
                    <TableCell className="px-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand/12 text-brand-bright">
                          <Building2 className="size-4.5" />
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/${o.slug}`}
                            className="truncate text-sm font-medium text-foreground outline-none hover:text-link focus-visible:text-link"
                          >
                            {o.name}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">/{o.slug}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isOwner ? "brand" : "outline"} className="capitalize">
                        {o.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex items-center justify-end gap-2">
                        {isOwner && (
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/${o.slug}/settings`}>
                              <Settings2 className="size-4" />
                              Settings
                            </Link>
                          </Button>
                        )}
                        <LeaveOrgButton slug={o.slug} name={o.name} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableShell>
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

      {deletedError ? (
        <Alert variant="destructive" className="mt-10">
          Couldn&apos;t load your recently deleted organizations. Refresh to try again.
        </Alert>
      ) : (
        deleted.length > 0 && <DeletedOrgsList initial={deleted} />
      )}
      {deleted.length > 0 && atLimit && (
        <p className="mt-3 text-xs text-muted-foreground">
          Restoring an organization counts toward the free plan&apos;s one owned organization.
        </p>
      )}
    </div>
  );
}
