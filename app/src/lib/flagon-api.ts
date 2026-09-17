// Server-side gateway to the Go API. The app is the only caller that holds the
// internal token; it has already verified the user's session, so it forwards
// the verified user identity via headers. Never import this from client code
// (it reads the session and the internal token).
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const API_URL = process.env.FLAGON_API_URL ?? "http://localhost:8080";
const INTERNAL_TOKEN = process.env.FLAGON_INTERNAL_TOKEN ?? "";

export interface Org {
  id: string;
  name: string;
  slug: string;
  role: string;
  created_at: string;
}

export interface Me {
  user: { id: string; email: string; created_at: string };
  orgs: Org[];
}

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

async function call(
  path: string,
  init: RequestInit,
  user: { id: string; email: string },
) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INTERNAL_TOKEN}`,
      "X-Flagon-User-Id": user.id,
      "X-Flagon-User-Email": user.email,
      ...init.headers,
    },
    cache: "no-store",
  });
}

/** Current user + their orgs, or null when not signed in. */
export async function getMe(): Promise<Me | null> {
  const user = await currentUser();
  if (!user) return null;
  const res = await call("/me", { method: "GET" }, user);
  if (!res.ok) throw new Error(`api /me failed (${res.status})`);
  return res.json();
}

/** Create an org owned by the current user. Throws on conflict/other errors. */
export async function createOrg(name: string, slug?: string): Promise<Org> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  const res = await call(
    "/orgs",
    { method: "POST", body: JSON.stringify({ name, slug }) },
    user,
  );
  if (res.status === 409) throw new Error("That organization name is already taken.");
  if (res.status === 422) throw new Error("Please enter a valid organization name.");
  if (!res.ok) throw new Error(`api /orgs failed (${res.status})`);
  return res.json();
}
