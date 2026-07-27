import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listPersonalTokens } from "@/lib/access-token";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { TokensManager } from "@/components/settings/tokens-manager";
import {
  createPersonalTokenAction,
  revokePersonalTokenAction,
} from "./actions";

export const metadata: Metadata = { title: "Access tokens · Settings" };

export default async function TokensSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const tokens = await listPersonalTokens(session.user.id);

  return (
    <div>
      <SettingsHeader
        title="Personal access tokens"
        description="Tokens authenticate you to the Flagon API. Treat them like passwords."
      />
      <SettingsSection
        title="Tokens"
        description="Each token acts as you across your organizations."
      >
        <TokensManager
          tokens={tokens.map((t) => ({
            id: t.id,
            name: t.name,
            prefix: t.prefix,
            lastFour: t.lastFour,
            createdAt: t.createdAt.toISOString(),
            lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
            expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
          }))}
          createAction={createPersonalTokenAction}
          revokeAction={revokePersonalTokenAction}
          scopeNote="Personal tokens act on your behalf across every organization you belong to."
        />
      </SettingsSection>
    </div>
  );
}
