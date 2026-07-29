"use server";

import { startBillingCheckout, openBillingPortal } from "@/lib/flags-api";

type Result = { url?: string; error?: string };

/**
 * Start (or resume management of) the Pro subscription. Thin wrapper over the
 * API, which owns all billing logic: it authorizes the caller (owner/admin,
 * cookie-forwarded), decides checkout vs. portal, and creates the Stripe
 * session. We just relay the URL for the client to navigate to.
 */
export async function startCheckoutAction(slug: string): Promise<Result> {
  const { data, error } = await startBillingCheckout(slug);
  return { url: data?.url, error };
}

/** Open the Stripe billing portal to manage an existing subscription. */
export async function openPortalAction(slug: string): Promise<Result> {
  const { data, error } = await openBillingPortal(slug);
  return { url: data?.url, error };
}
