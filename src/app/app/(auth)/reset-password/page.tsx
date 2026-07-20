import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
};

/**
 * Landing page for the emailed reset link. BetterAuth's callback redirects
 * here with ?token=... on success or ?error=INVALID_TOKEN when the link is
 * expired or already used.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return <ResetPasswordForm token={token ?? null} invalid={Boolean(error)} />;
}
