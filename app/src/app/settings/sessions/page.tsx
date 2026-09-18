import { SettingsHeader } from "@/components/settings/section";
import { SessionsList } from "@/components/settings/sessions-list";

export default function SessionsPage() {
  return (
    <div>
      <SettingsHeader
        title="Sessions"
        description="Devices and browsers signed in to your account. Revoke any you don't recognize."
      />
      <SessionsList />
    </div>
  );
}
