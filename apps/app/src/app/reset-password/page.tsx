import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@flagon/design";
import { AuthShell } from "@/components/auth-shell";
import { FormError } from "@/components/form-error";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: `Set a new ${brand.name} password.`,
};

/**
 * The target of the reset link. BetterAuth redirects here with `?token=...`
 * after the user clicks through their email. Without a token there is nothing to
 * do, so we say so and point back to requesting a fresh link.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Set a new password for your account."
      footer={
        <>
          {"Remembered it? "}
          <Link
            href="/login"
            className="text-teal-400 transition-colors hover:text-teal-300"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <FormError>
          This reset link is invalid or has expired.{" "}
          <Link
            href="/forgot-password"
            className="font-medium underline underline-offset-2 hover:text-red-200"
          >
            Request a new one
          </Link>
          .
        </FormError>
      )}
    </AuthShell>
  );
}
