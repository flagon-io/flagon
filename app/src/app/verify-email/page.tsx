"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Alert, Button, Input, Label } from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";
import { OtpInput } from "@/components/auth/otp-input";
import { AuthCard } from "@/components/auth/auth-card";

const RESEND_COOLDOWN = 30;

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const linkOtp = params.get("otp") ?? "";

  // Email may be absent (e.g. arriving after a username sign-in), so we prompt
  // for it below and keep it in state once known.
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [emailInput, setEmailInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // If we arrived via a click-to-verify link, start in the verifying state.
  const [verifying, setVerifying] = useState(Boolean(linkOtp));

  // Auto-verify when the code came in via the email link. The body starts with
  // an await, so there's no synchronous setState inside the effect.
  useEffect(() => {
    if (!linkOtp) return;
    let active = true;
    (async () => {
      const { error: verifyError } = await authClient.emailOtp.verifyEmail({ email, otp: linkOtp });
      if (!active) return;
      if (verifyError) {
        setError("That link didn't work or expired. Enter the code below instead.");
        setVerifying(false);
      } else {
        // autoSignInAfterVerification created a session; land in the app.
        router.push("/");
      }
    })();
    return () => {
      active = false;
    };
  }, [linkOtp, email, router]);

  async function handleComplete(otp: string) {
    setError(null);
    setVerifying(true);
    const { error: verifyError } = await authClient.emailOtp.verifyEmail({ email, otp });
    if (verifyError) {
      setError(verifyError.message ?? "That code didn't work. Please try again.");
      setVerifying(false);
      return;
    }
    router.push("/");
  }

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(to: string) {
    setError(null);
    setResent(false);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email: to,
      type: "email-verification",
    });
    if (sendError) {
      setError(sendError.message ?? "Couldn't send the code. Please try again.");
      return false;
    }
    setResent(true);
    setCooldown(RESEND_COOLDOWN);
    return true;
  }

  async function handleEnterEmail(e: React.FormEvent) {
    e.preventDefault();
    const to = emailInput.trim();
    if (!to) return;
    if (await sendCode(to)) setEmail(to);
  }

  async function handleResend() {
    if (cooldown > 0) return;
    await sendCode(email);
  }

  // Ask for the email first when we don't have one (e.g. username sign-in).
  if (!linkOtp && !email) {
    return (
      <AuthCard
        title="Verify your email"
        subtitle="Enter your email and we'll send you a verification code."
        footer={
          <>
            Wrong address?{" "}
            <Link href="/signup" className="font-medium text-link underline">
              Start over
            </Link>
          </>
        }
      >
        <form onSubmit={handleEnterEmail} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="verify-email">Email</Label>
            <Input
              id="verify-email"
              type="email"
              required
              autoFocus
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
            />
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button type="submit" disabled={!emailInput.trim()} className="mt-1 w-full">
            Send code
          </Button>
        </form>
      </AuthCard>
    );
  }

  const linkVerifying = Boolean(linkOtp) && verifying && !error;

  return (
    <AuthCard
      title={linkVerifying ? "Verifying your email" : "Check your inbox"}
      subtitle={
        linkVerifying
          ? "Hang tight - this only takes a moment."
          : `We sent a code and a verification link to ${email}. Click the link or enter the code below.`
      }
      footer={
        <>
          Wrong address?{" "}
          <Link href="/signup" className="font-medium text-link underline">
            Start over
          </Link>
        </>
      }
    >
      {linkVerifying ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="size-6 animate-spin text-brand" />
          <p className="text-sm text-muted-foreground">Signing you in...</p>
        </div>
      ) : (
        <div className="text-center">
          <OtpInput onComplete={handleComplete} disabled={verifying} />

          {error && (
            <Alert variant="destructive" className="mt-4 text-left">
              {error}
            </Alert>
          )}
          {resent && !error && (
            <p className="mt-4 text-sm text-muted-foreground">A new code is on its way.</p>
          )}

          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0}
            className="mt-6 text-sm font-medium text-muted-foreground underline hover:text-foreground disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Not seeing it?"}
          </button>
        </div>
      )}
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
