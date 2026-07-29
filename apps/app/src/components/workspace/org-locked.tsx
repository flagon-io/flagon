"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@flagon/design";
import { FormError } from "@/components/form-error";
import {
  startCheckoutAction,
  openPortalAction,
} from "@/app/[org]/settings/billing/actions";

/**
 * The locked-workspace screen. Shown in place of the org's content when a Pro
 * org has no entitling subscription (see isOrgLocked): a lapsed/canceled
 * subscription, or a freshly created Pro org that has not paid yet. Owners and
 * admins get a button to set up or reactivate billing; everyone else is told to
 * ask an owner. The org switcher in the sidebar still lets them move elsewhere.
 */
export function OrgLocked({
  slug,
  canManage,
  status,
}: {
  slug: string;
  canManage: boolean;
  status: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canceled = status === "canceled" || status === "unpaid";
  const heading = canceled ? "Subscription inactive" : "Finish setting up Pro";
  const body = canceled
    ? "This organization's Pro subscription is no longer active. Reactivate it to unlock the workspace again."
    : "This organization is on Pro but its subscription isn't active yet. Complete checkout to unlock the workspace.";

  function reactivate() {
    setError(null);
    startTransition(async () => {
      // startCheckoutAction routes to the portal if a live subscription exists,
      // otherwise opens a fresh checkout — the right thing for both an
      // unfinished ("incomplete") and a fully canceled subscription.
      const result = await startCheckoutAction(slug);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.url) window.location.href = result.url;
    });
  }

  async function manage() {
    setError(null);
    startTransition(async () => {
      const result = await openPortalAction(slug);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.url) window.location.href = result.url;
    });
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-5 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
        <Lock className="h-5 w-5 text-zinc-300" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold text-zinc-100">{heading}</h1>
        <p className="text-sm text-zinc-400">{body}</p>
      </div>

      {canManage ? (
        <div className="flex flex-col items-center gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={reactivate}
            disabled={pending}
          >
            {pending
              ? "One moment…"
              : canceled
                ? "Reactivate Pro"
                : "Continue to checkout"}
          </Button>
          {canceled ? (
            <button
              type="button"
              onClick={manage}
              disabled={pending}
              className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-60"
            >
              Manage billing details
            </button>
          ) : null}
          {error ? <FormError>{error}</FormError> : null}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Ask an owner or admin of this organization to set up billing.
        </p>
      )}

      <Link
        href="/"
        className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
      >
        Back to your organizations
      </Link>
    </div>
  );
}
