"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { startProCheckout } from "../billing-actions";
import { buttonClass } from "@/components/form-ui";

/** Free -> Pro upgrade: creates the Stripe Checkout session and redirects. */
export function UpgradeButton({ orgSlug }: { orgSlug: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    setError(null);
    setPending(true);
    const result = await startProCheckout(orgSlug);
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      return;
    }
    window.location.href = result.url;
  }

  return (
    <div>
      <button
        type="button"
        onClick={upgrade}
        disabled={pending}
        className={`${buttonClass} inline-flex items-center gap-1.5`}
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        {pending ? "Heading to checkout..." : "Upgrade to Pro"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
