import { SettingsHeader } from "@/components/settings/section";
import { TokenCreateForm } from "@/components/settings/token-create-form";

export default function NewPersonalTokenPage() {
  return (
    <div>
      <SettingsHeader
        title="New personal access token"
        description="This token acts as you. Give it a name, pick what it can do, and set an expiration."
      />
      <TokenCreateForm basePath="/api/tokens" kind="pat" backHref="/settings/tokens" />
    </div>
  );
}
