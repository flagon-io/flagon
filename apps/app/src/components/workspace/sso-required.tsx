"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Button } from "@flagon/design";
import { FormError } from "@/components/form-error";
import { authClient } from "@/lib/auth-client";

/**
 * The SSO-required screen. Shown in place of an org's content when the org
 * enforces single sign-on and the member has no active SSO session (see the
 * enforcement gate in [org]/layout.tsx). The member keeps their personal Flagon
 * account; this only asks them to authenticate against the org's IdP before the
 * org's resources are shown, exactly like GitHub SAML enforcement. The owner is
 * never sent here. The sidebar org switcher still lets them move elsewhere.
 */
export function SsoRequired({
  slug,
  orgName,
}: {
  slug: string;
  orgName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function authenticate() {
    setError(null);
    startTransition(async () => {
      // Resolve the org's provider by slug and hand off to the IdP; on return,
      // provisionUser stamps the SSO session and this gate clears.
      const result = await authClient.signIn.sso({
        organizationSlug: slug,
        callbackURL: window.location.href,
      });
      if (result?.error) {
        setError(
          result.error.message ??
            "Could not start single sign-on. Ask an owner to check the SSO configuration.",
        );
        return;
      }
      if (result?.data?.url) window.location.href = result.data.url;
    });
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-5 text-center">
      <div className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <KeyRound className="size-5 text-zinc-300" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold text-zinc-100">
          Single sign-on required
        </h1>
        <p className="text-sm text-zinc-400">
          {orgName} requires you to authenticate with its identity provider
          before you can access its resources. You will come right back here.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={authenticate}
          disabled={pending}
        >
          {pending ? "Redirecting…" : "Continue with single sign-on"}
        </Button>
        {error ? <FormError>{error}</FormError> : null}
      </div>

      <Link
        href="/"
        className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
      >
        Back to your organizations
      </Link>
    </div>
  );
}
