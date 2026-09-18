import { SettingsHeader } from "@/components/settings/section";
import { TokensList } from "@/components/settings/tokens-list";

export default function PersonalTokensPage() {
  return (
    <div>
      <SettingsHeader
        title="Personal access tokens"
        description="Tokens act as you across your organizations, for the Flagon API and CLI. Treat them like passwords."
      />
      <TokensList basePath="/api/tokens" newHref="/settings/tokens/new" />
    </div>
  );
}
