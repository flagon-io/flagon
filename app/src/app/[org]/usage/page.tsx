import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Badge, Card } from "@flagon-io/ui";
import { PageHeader, PageBody } from "@/components/shell/page-header";

export default async function UsagePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <>
      <PageHeader
        title={
          <>
            Usage
            <Badge variant="outline">Coming soon</Badge>
          </>
        }
        description="Metered consumption and plan limits for this organization."
      />
      <PageBody>
        {/* A realistic preview, clearly inert until metering ships. */}
        <div
          aria-hidden
          className="pointer-events-none space-y-4 opacity-45 blur-[0.4px] select-none"
        >
        <Card className="flex items-center gap-4 p-5">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Included credit</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">$0.00 / $20.00</p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[6%] rounded-full bg-brand" />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Consumption breakdown</h2>
            <div className="flex items-center gap-1 rounded-md border border-hairline p-0.5 text-xs text-muted-foreground">
              <span className="rounded bg-panel px-2 py-1 text-foreground">Daily</span>
              <span className="px-2 py-1">Weekly</span>
              <span className="px-2 py-1">Monthly</span>
            </div>
          </div>
          <div className="flex h-56 items-end gap-1.5">
            {[38, 52, 29, 61, 47, 70, 44, 58, 33, 66, 49, 55, 40, 72].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-muted"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </Card>
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Per-organization usage metering isn&rsquo;t available yet.
        </p>
      </PageBody>
    </>
  );
}
