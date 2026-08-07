"use server";

import { revalidatePath } from "next/cache";
import {
  configureIntegration,
  removeIntegration,
  testIntegration,
  updateIntegrationOptions,
  type IntegrationView,
} from "@/lib/integrations-api";

/**
 * Console actions for org Integrations. Every write proxies to the API
 * (integrations-api → /v1/orgs/:org/integrations), which authorizes owner/admin
 * and runs the live connection test. Secrets only travel outward here; the
 * catalog the page reads never returns them.
 */

// Revalidate both the provider's setup page (where the form lives) and the
// index (whose rows show connection status).
function revalidate(slug: string, provider: string) {
  revalidatePath(`/${slug}/integrations/${provider}`);
  revalidatePath(`/${slug}/integrations`);
}

export async function configureIntegrationAction(
  slug: string,
  provider: string,
  values: Record<string, string>,
): Promise<{ integration?: IntegrationView; error?: string }> {
  const { data, error } = await configureIntegration(slug, provider, values);
  if (error) return { error };
  revalidate(slug, provider);
  return { integration: data?.integration };
}

export async function updateIntegrationOptionsAction(
  slug: string,
  provider: string,
  options: Record<string, boolean>,
): Promise<{ integration?: IntegrationView; error?: string }> {
  const { data, error } = await updateIntegrationOptions(slug, provider, options);
  if (error) return { error };
  revalidate(slug, provider);
  return { integration: data?.integration };
}

export async function testIntegrationAction(
  slug: string,
  provider: string,
): Promise<{ ok?: boolean; message?: string; error?: string }> {
  const { data, error } = await testIntegration(slug, provider);
  if (error) return { error };
  revalidate(slug, provider);
  return { ok: data?.test.ok, message: data?.test.message };
}

export async function removeIntegrationAction(
  slug: string,
  provider: string,
): Promise<{ error?: string }> {
  const { error } = await removeIntegration(slug, provider);
  if (error) return { error };
  revalidate(slug, provider);
  return {};
}
