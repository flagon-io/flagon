"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * The "verify your email" nag. Verification does not gate access (you are signed
 * in), so this is a dismissible reminder with a one-click resend. It rides at the
 * top of the workspace content until the address is confirmed.
 */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function resend() {
    setState("sending");
    await authClient.sendVerificationEmail({
      email,
      callbackURL: "/login?verified=1",
    });
    setState("sent");
  }

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/[0.07] px-6 py-2.5">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 text-sm">
        <MailIcon />
        <p className="flex-1 text-amber-100">
          {state === "sent" ? (
            <>
              Verification sent to{" "}
              <span className="font-medium">{email}</span>. Check your inbox.
            </>
          ) : (
            <>
              Verify your email to secure your account.{" "}
              <span className="text-amber-200/70">{email}</span>
            </>
          )}
        </p>
        {state !== "sent" ? (
          <button
            type="button"
            onClick={resend}
            disabled={state === "sending"}
            className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
          >
            {state === "sending" ? "Sending…" : "Resend email"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 rounded p-1 text-amber-300/60 transition-colors hover:bg-amber-500/10 hover:text-amber-100"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

function MailIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="shrink-0 text-amber-300"
      aria-hidden
    >
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="M2.5 4.5L8 8.5l5.5-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
