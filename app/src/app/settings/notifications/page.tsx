import { Badge, Card, Switch } from "@flagon-io/ui";
import { SettingsHeader, SettingsSubheader } from "@/components/settings/section";
import { NotificationsFeed } from "@/components/settings/notifications-feed";

export default function NotificationsPage() {
  return (
    <div>
      <SettingsHeader
        title="Notifications"
        description="Your notification feed, and how Flagon reaches you."
      />

      <div className="space-y-10">
        <section className="space-y-4">
          <SettingsSubheader title="Recent" />
          <NotificationsFeed />
        </section>

        <section className="space-y-4">
          <SettingsSubheader
            title="Delivery"
            description="Choose where notifications are delivered."
          />
          <Card className="divide-y divide-hairline">
            {[
              { label: "In-product", desc: "Show notifications in the app bell.", on: true },
              { label: "Email", desc: "Email me about important activity.", on: false },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {row.label}
                    {!row.on && <Badge variant="outline">Coming soon</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{row.desc}</p>
                </div>
                <Switch checked={row.on} disabled aria-label={`${row.label} notifications`} />
              </div>
            ))}
          </Card>
        </section>
      </div>
    </div>
  );
}
