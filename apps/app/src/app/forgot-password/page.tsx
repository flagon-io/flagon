import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@flagon/design";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
  description: `Reset your ${brand.name} password.`,
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to get back in."
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
      <ForgotPasswordForm />
    </AuthShell>
  );
}
