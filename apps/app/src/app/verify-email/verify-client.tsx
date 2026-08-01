"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { API_URL } from "@/lib/urls";
import { FormError } from "@/components/form-error";

type State = "verifying" | "success" | "error";

/**
 * Verifies the email in the browser by calling the API's verify endpoint directly,
 * credentialed — so the auto-sign-in session cookie the API sets lands (it's
 * apex-scoped, shared across app./api.). No `callbackURL` is sent, so the API
 * returns JSON instead of redirecting: the user never leaves the console. Already-
 * verified tokens also come back OK, so a second click is harmless.
 */
export function VerifyEmail({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("verifying");
  const ran = useRef(false);

  useEffect(() => {
    // Effects can double-invoke in dev; verify once.
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
          { method: "GET", credentials: "include" },
        );
        setState(res.ok ? "success" : "error");
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  // Once verified, the API has signed the user in — drop them into the app.
  useEffect(() => {
    if (state !== "success") return;
    const t = setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1400);
    return () => clearTimeout(t);
  }, [state, router]);

  if (state === "error") {
    return (
      <FormError>
        This verification link is invalid or has expired.{" "}
        <Link
          href="/login"
          className="font-medium underline underline-offset-2 hover:text-red-200"
        >
          Sign in
        </Link>{" "}
        to request a new one.
      </FormError>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      {state === "verifying" ? (
        <>
          <Loader2 className="size-6 animate-spin text-zinc-500" />
          <p className="text-sm text-zinc-400">Verifying your email…</p>
        </>
      ) : (
        <>
          <CheckCircle2 className="size-7 text-teal-400" />
          <div>
            <p className="text-sm font-medium text-zinc-100">Email verified</p>
            <p className="mt-0.5 text-xs text-zinc-500">Taking you to Flagon…</p>
          </div>
          <Link
            href="/"
            className="mt-1 text-sm text-teal-400 transition-colors hover:text-teal-300"
          >
            Continue now
          </Link>
        </>
      )}
    </div>
  );
}
