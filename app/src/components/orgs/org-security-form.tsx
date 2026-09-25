"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, KeyRound, AlertTriangle } from "lucide-react";
import { Alert, Card, Spinner, Switch } from "@flagon-io/ui";
import type { OrgSecurity } from "@/lib/api/types";
import { errorMessage } from "@/lib/client-fetch";

/**
 * Org security policy: the 2FA requirement (an owner can only turn it ON if their
 * OWN 2FA is on) and the SSO requirement (only once they've signed in through the
 * org's SSO themselves) - both lockout-safe. The base permission lives under Member
 * privileges, not here. Each toggle sends only its own field; the API merges.
 */
export function OrgSecurityForm({
  slug,
  enforceTwoFactor,
  requireSSO,
  viewerHasTwoFactor,
  hasSSOProvider,
  viewerHasSSO,
}: {
  slug: string;
  enforceTwoFactor: boolean;
  requireSSO: boolean;
  viewerHasTwoFactor: boolean;
  hasSSOProvider: boolean;
  viewerHasSSO: boolean;
}) {
  const [enabled, setEnabled] = useState(enforceTwoFactor);
  const [sso, setSso] = useState(requireSSO);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Can't require 2FA you don't have yourself (lockout safety). Turning it OFF is
  // always allowed.
  const lockedOut = !viewerHasTwoFactor && !enabled;
  // Requiring SSO needs a provider AND that you've signed in through it yourself
  // (lockout safety, parallel to 2FA). Turning it OFF is always allowed.
  const ssoNoProvider = !hasSSOProvider && !sso;
  const ssoNotLinked = hasSSOProvider && !viewerHasSSO && !sso;
  const ssoBlocked = ssoNoProvider || ssoNotLinked;

  async function save(patch: Partial<OrgSecurity>, revert: () => void) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/orgs/${encodeURIComponent(slug)}/security`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!res.ok) {
      revert();
      setError(await errorMessage(res, "Couldn't save the setting."));
    }
  }

  function toggleTwoFactor(next: boolean) {
    const prev = enabled;
    setEnabled(next);
    void save({ enforce_two_factor: next }, () => setEnabled(prev));
  }

  function toggleSSO(next: boolean) {
    const prev = sso;
    setSso(next);
    void save({ require_sso: next }, () => setSso(prev));
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand-bright">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                Require two-factor authentication
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Members must have 2FA enabled to access this organization. Members without it are
                sent to set it up before they can continue.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {busy && <Spinner className="size-4" />}
            <Switch
              checked={enabled}
              onCheckedChange={toggleTwoFactor}
              disabled={busy || lockedOut}
              aria-label="Require two-factor authentication"
            />
          </div>
        </div>

        {lockedOut && (
          <Alert variant="warning" className="mt-3" icon={<AlertTriangle />}>
            Enable two-factor authentication on{" "}
            <Link href="/settings/security" className="font-medium underline underline-offset-4">
              your own account
            </Link>{" "}
            first - otherwise turning this on would lock you out.
          </Alert>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand-bright">
              <KeyRound className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Require single sign-on</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Members must sign in through this organization&rsquo;s SSO provider.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            {busy && <Spinner className="size-4" />}
            <Switch
              checked={sso}
              onCheckedChange={toggleSSO}
              disabled={busy || ssoBlocked}
              aria-label="Require single sign-on"
            />
          </div>
        </div>
        {ssoNoProvider && (
          <Alert variant="warning" className="mt-3" icon={<AlertTriangle />}>
            Configure an SSO provider below before requiring it.
          </Alert>
        )}
        {ssoNotLinked && (
          <Alert variant="warning" className="mt-3" icon={<AlertTriangle />}>
            Sign in through this organization&rsquo;s SSO yourself first - otherwise turning this on
            would lock you out.
          </Alert>
        )}
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
