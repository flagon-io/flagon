import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@flagon/design";
import { AuthShell } from "@/components/auth-shell";
import { FormError } from "@/components/form-error";
import { VerifyEmail } from "./verify-client";

export const metadata: Metadata = {
  title: "Verify your email",
  description: `Confirm your ${brand.name} email address.`,
};

/**
 * The target of the verification email link. The link carries `?token=...` and
 * points HERE (the console), not the API — the client below calls the API to
 * verify, so the user stays in the product the whole time and never lands on an
 * API response. Public (see proxy.ts): it must work before you're signed in.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell
      title="Verify your email"
      subtitle="Confirming your email address."
      footer={
        <>
          {"Need a hand? "}
          <Link
            href="/login"
            className="text-teal-400 transition-colors hover:text-teal-300"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      {token ? (
        <VerifyEmail token={token} />
      ) : (
        <FormError>
          This verification link is invalid or incomplete.{" "}
          <Link
            href="/login"
            className="font-medium underline underline-offset-2 hover:text-red-200"
          >
            Sign in
          </Link>{" "}
          to request a new one.
        </FormError>
      )}
    </AuthShell>
  );
}
