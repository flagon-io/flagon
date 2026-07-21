"use client";

import { useState } from "react";
import { subtleButtonClass } from "@/components/form-ui";
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

  // The failure is reported UNDER the button, at the button's width. `Notice`
  // is a page-width banner: rendered here it stretched the card's action
  // column to the width of the message and pushed the button down, so a
  // failed click rearranged the page around itself.
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className={subtleButtonClass}
      >
        {pending ? "Opening..." : "Manage billing"}
      </button>
      {error ? (
        <p role="alert" className="max-w-60 text-right text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
