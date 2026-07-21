"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { auth } from "@/lib/auth";
import { billingEnabled, createBillingPortalSession } from "@/lib/billing";
import { absoluteAppUrl } from "@/lib/absolute-url";
import { resolveOrg } from "../resolve-org";

/**
 * Stripe's hosted billing portal (payment method, invoices, cancellation).
 * A browser flow like Checkout, so it lives here rather than in the
 * versioned API. Owners and admins only.
 */
export type PortalResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

export async function openBillingPortal(
  orgSlug: string,
): Promise<PortalResult> {
  if (!billingEnabled()) {
    return { ok: false, message: "Billing isn't enabled on this deployment." };
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const org = await resolveOrg(orgSlug);
  if (!session || !org) return { ok: false, message: "Organization not found." };

  const role = org.members.find((m) => m.userId === session.user.id)?.role;
  if (role !== "owner" && role !== "admin") {
    return { ok: false, message: "Only owners and admins manage billing." };
  }

  const [row] = await db
    .select({ customerId: organizations.stripeCustomerId })
    .from(organizations)
    .where(eq(organizations.id, org.id))
    .limit(1);
  if (!row?.customerId) {
    return {
      ok: false,
      message: "This organization has no billing history yet.",
    };
  }

  try {
    const url = await createBillingPortalSession(
      row.customerId,
      await absoluteAppUrl(`/${orgSlug}/billing`),
    );
    if (!url) {
      return { ok: false, message: "Could not open the billing portal." };
    }
    return { ok: true, url };
  } catch (error) {
    // Stripe needs a billing portal configuration saved in the dashboard
    // before it will open one; say so instead of throwing a 500 at the user.
    const message =
      error instanceof Error ? error.message : "Could not open the billing portal.";
    return { ok: false, message };
  }
}
