// Access tokens: personal (PAT, /me/tokens) and organization (OAT).
import { orgPath, request } from "./client";
import type { AccessToken, CreatedToken, CreateTokenBody } from "./types";

function createToken(path: string, body: CreateTokenBody): Promise<CreatedToken> {
  return request<CreatedToken>(path, {
    method: "POST",
    body,
    fallback: "Could not create the token.",
  });
}

async function listTokens(path: string): Promise<AccessToken[]> {
  const data = await request<{ tokens?: AccessToken[] | null }>(path);
  return data.tokens ?? [];
}

function revokeToken(path: string): Promise<void> {
  return request(path, { method: "DELETE", fallback: "Could not revoke the token." });
}

export const createPAT = (body: CreateTokenBody) => createToken("/me/tokens", body);
export const listPATs = () => listTokens("/me/tokens");
export const revokePAT = (id: string) => revokeToken(`/me/tokens/${encodeURIComponent(id)}`);

export const createOAT = (slug: string, body: CreateTokenBody) =>
  createToken(`${orgPath(slug)}/tokens`, body);
export const listOATs = (slug: string) => listTokens(`${orgPath(slug)}/tokens`);
export const revokeOAT = (slug: string, id: string) =>
  revokeToken(`${orgPath(slug)}/tokens/${encodeURIComponent(id)}`);
