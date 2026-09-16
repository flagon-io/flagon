"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { OtpInput } from "@/components/auth/otp-input";
import { AuthCard } from "@/components/auth/auth-card";

function VerifyEmailForm() {
  const router = useRouter();
  const email = useSearchParams().get("email") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function handleComplete(otp: string) {
    setError(null);
    setVerifying(true);

    const { error: verifyError } = await authClient.emailOtp.verifyEmail({
      email,
      otp,
    });

    setVerifying(false);

    if (verifyError) {
      setError(
        verifyError.message ?? "That code didn't work. Please try again.",
      );
      return;
    }

    router.push("/login");
  }

  async function handleResend() {
    setError(null);
    setResent(false);
    const { error: resendError } =
      await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
    if (resendError) {
      setError(
        resendError.message ?? "Couldn't resend the code. Please try again.",
      );
      return;
    }
    setResent(true);
  }

  return (
    <AuthCard
      title="Check your inbox"
      subtitle={`We sent a 6-digit code to ${email}. It's valid for 30 minutes.`}
      footer={
        <>
          Wrong address?{" "}
          <Link href="/signup" className="font-medium text-link underline">
            Start over
          </Link>
        </>
      }
    >
      <div className="text-center">
        <OtpInput onComplete={handleComplete} disabled={verifying} />

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        {resent && !error && (
          <p className="mt-4 text-sm text-muted-foreground">
            A new code is on its way.
          </p>
        )}

        <button
          type="button"
          onClick={handleResend}
          className="mt-6 text-sm font-medium text-muted-foreground underline hover:text-foreground"
        >
          Not seeing it?
        </button>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}
