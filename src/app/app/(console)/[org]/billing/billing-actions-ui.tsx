"use client";

import { useState } from "react";
import { Notice, subtleButtonClass } from "@/components/form-ui";
import { openBillingPortal } from "./actions";

/** Opens Stripe's hosted portal for payment method, invoices, and cancellation. */
export function ManageBillingButton({ orgSlug }: { orgSlug: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function open() {
    setError(null);
    setPending(true);
    const result = await openBillingPortal(orgSlug);
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      return;
    }
    window.location.href = result.url;
  }

  return (
    <div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className={subtleButtonClass}
      >
        {pending ? "Opening..." : "Manage billing"}
      </button>
    </div>
  );
}
