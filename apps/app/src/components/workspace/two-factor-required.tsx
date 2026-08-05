"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@flagon/design";

/**
 * The 2FA-required screen. Shown in place of an org's content when the org
 * requires two-factor authentication and the member has not enrolled (see the
 * enforcement gate in [org]/layout.tsx). Enrollment is a PERSONAL setting, so
 * the CTA sends them to their account security page; once enrolled the gate
 * clears. The owner is never sent here.
 */
export function TwoFactorRequired({ orgName }: { orgName: string }) {
  const router = useRouter();
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-5 text-center">
      <div className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <ShieldCheck className="size-5 text-zinc-300" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold text-zinc-100">
          Two-factor authentication required
        </h1>
        <p className="text-sm text-zinc-400">
          {orgName} requires every member to have two-factor authentication
          enabled. Set it up on your account to continue.
        </p>
      </div>

      <Button
        type="button"
        variant="primary"
        onClick={() => router.push("/settings/security")}
      >
        Set up two-factor authentication
      </Button>

      <Link
        href="/"
        className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
      >
        Back to your organizations
      </Link>
    </div>
  );
}
