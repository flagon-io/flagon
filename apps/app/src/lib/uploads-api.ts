import "server-only";
import { headers } from "next/headers";
import { API_URL } from "./urls";

/**
 * Server-side client for the Uploads endpoints in the API. Mirrors projects-api.ts:
 * forwards the caller's session cookie so the API authorizes org + role. The
 * actual byte transfer does NOT happen here — the API returns a presigned PUT the
 * browser uploads to directly; this module only requests tickets and confirms.
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookie = (await headers()).get("cookie") ?? "";
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

async function unwrap<T>(res: Response): Promise<{ data?: T; error?: string }> {
  const body = await res.json().catch(() => null);
  if (!res.ok) return { error: (body?.message as string) ?? `Request failed (${res.status}).` };
  return { data: body as T };
}

export type UploadConfig = {
  enabled: boolean;
  maxSizeBytes: number;
  acceptedTypes: string[];
};

export type UploadTicket = {
  assetId: string;
  upload: {
    url: string;
    method: "PUT";
    headers: Record<string, string>;
    expiresIn: number;
  };
  publicUrl: string;
};

export type UploadedAsset = {
  id: string;
  purpose: string | null;
  contentType: string;
  size: number;
  status: string;
  url: string | null;
};

/** Whether uploads are enabled on this deployment (+ limits). Safe default: off. */
export async function getUploadConfig(slug: string): Promise<UploadConfig> {
  const res = await apiFetch(`/v1/orgs/${slug}/uploads/config`);
  if (!res.ok) return { enabled: false, maxSizeBytes: 0, acceptedTypes: [] };
  return (await res.json()) as UploadConfig;
}

export type UploadPurpose = "org-logo" | "project-icon";

/** Request a presigned upload for a given purpose. Owner/admin. */
export async function requestUpload(
  slug: string,
  body: { purpose: UploadPurpose; contentType: string; size: number },
) {
  return unwrap<UploadTicket>(
    await apiFetch(`/v1/orgs/${slug}/uploads`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

/** Confirm the object was uploaded and mark the asset ready. Owner/admin. */
export async function completeUpload(slug: string, assetId: string) {
  return unwrap<{ asset: UploadedAsset }>(
    await apiFetch(`/v1/orgs/${slug}/uploads/${assetId}/complete`, { method: "POST" }),
  );
}
