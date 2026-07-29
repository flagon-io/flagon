"use client";

import { useState, useTransition } from "react";
import { Button } from "@flagon/design";
import { FormError } from "@/components/form-error";
import { startCheckoutAction, openPortalAction } from "./actions";

type Action = "checkout" | "portal";

/**
 * The billing call-to-action button. Runs the matching server action, which
 * returns a Stripe URL (checkout or portal) for us to navigate to, or an error
 * to show inline. Kept as one small client island so the page stays a server
 * component.
 */
export function BillingActionButton({
  slug,
  action,
  label,
  variant = "primary",
}: {
  slug: string;
  action: Action;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result =
        action === "checkout"
          ? await startCheckoutAction(slug)
          : await openPortalAction(slug);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.url) {
        window.location.href = result.url;
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={variant}
        onClick={run}
        disabled={pending}
        className="w-fit"
      >
        {pending ? "One moment…" : label}
      </Button>
      {error ? <FormError>{error}</FormError> : null}
    </div>
  );
}
