"use client";

import { appPath } from "@/lib/urls";
import Link from "next/link";
import { useState } from "react";
import { MailWarning } from "lucide-react";
import { resendVerificationAction } from "./(account)/settings/emails/actions";

/**
 * Persistent console-wide nag shown while the primary email is unverified.
 * Unverified users can still sign in (locking them out of their own account
 * would be worse), but adding more emails and, later, org invites and
 * notifications are held until they prove the address is theirs.
 */
export function VerifyEmailBanner({
  email,
  emailRowId,
}: {
  email: string;
  emailRowId: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function resend() {
    setState("sending");
    try {
      const result = await resendVerificationAction(emailRowId);
      setState(result.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/10">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm text-amber-200">
        <MailWarning className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          Please verify your email address. We sent a link to{" "}
          <span className="font-medium">{email}</span>. You can&apos;t add other
          email addresses until it&apos;s verified.
        </span>
        <span className="ml-auto flex items-center gap-3">
          {state === "sent" ? (
            <span className="text-amber-300">Verification email sent.</span>
          ) : (
            <button
              type="button"
              onClick={resend}
              disabled={state === "sending"}
              className="font-medium text-amber-100 underline underline-offset-2 transition hover:text-white disabled:opacity-60"
            >
              {state === "sending"
                ? "Sending..."
                : state === "error"
                  ? "Sending failed. Try again"
                  : "Resend email"}
            </button>
          )}
          <Link
            href={appPath("/settings/emails")}
            className="text-amber-200/80 underline underline-offset-2 transition hover:text-amber-100"
          >
            Email settings
          </Link>
        </span>
      </div>
    </div>
  );
}
