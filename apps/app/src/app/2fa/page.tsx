import type { Metadata } from "next";
import { Suspense } from "react";
import { brand } from "@flagon/design";
import { AuthShell } from "@/components/auth-shell";
import { TwoFactorChallenge } from "./two-factor-challenge";

export const metadata: Metadata = {
  title: "Two-factor authentication",
  description: `Confirm it's you to finish signing in to ${brand.name}.`,
};

/**
 * The two-factor challenge, reached mid-sign-in when a user has 2FA enabled
 * (BetterAuth withholds the session and the client's onTwoFactorRedirect brings
 * them here). Public route: the full session does not exist yet.
 */
export default function TwoFactorPage() {
  return (
    <AuthShell
      title="Two-factor authentication"
      subtitle="Enter the 6-digit code from your authenticator app to finish signing in."
    >
      <Suspense>
        <TwoFactorChallenge />
      </Suspense>
    </AuthShell>
  );
}
