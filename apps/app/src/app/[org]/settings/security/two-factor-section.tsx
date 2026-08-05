"use client";

import { EnforcementToggle } from "@/components/settings/enforcement-toggle";
import { updateSecurityAction } from "./actions";

/**
 * "Require two-factor authentication for everyone", modeled on GitHub's block:
 * members without 2FA can't access the org's resources but stay members until
 * they enable it. The owner is never blocked.
 */
export function TwoFactorSection({
  slug,
  orgName,
  isOwner,
  require2fa,
}: {
  slug: string;
  orgName: string;
  isOwner: boolean;
  require2fa: boolean;
}) {
  return (
    <EnforcementToggle
      label="Require two-factor authentication"
      description={
        isOwner
          ? `Every member of ${orgName} except the owner must have two-factor authentication enabled to access its resources.`
          : "Only the organization owner can change two-factor enforcement."
      }
      enabled={require2fa}
      disabled={!isOwner}
      confirm={{
        title: "Require two-factor authentication?",
        body: `Members without two-factor authentication will be unable to access ${orgName}, but remain members until they enable it. The owner is never locked out.`,
        confirmLabel: "Require 2FA",
      }}
      onChange={(next) => updateSecurityAction(slug, { require2fa: next })}
    />
  );
}
