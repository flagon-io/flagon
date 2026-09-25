// The one HTTP path from the app (server side) to the Go API. The app is the only
// caller that holds the internal token; it has already verified the user's
// session, so it forwards the verified identity via headers. Never import this
// (or anything under lib/api except types.ts) from client code.
import { headers } from "next/headers";
import { currentUser, getSession } from "@/lib/session";
import { internalToken } from "@/lib/internal-token";
import { HttpError } from "@/lib/http-error";
import type { ListOptions, Page } from "./types";

const API_URL = process.env.FLAGON_API_URL ?? "http://localhost:8080";

/** The verified identity a request acts as. */
export interface Identity {
  id: string;
  email: string;
}

/**
 * ApiError is a failed gateway call. It preserves the upstream HTTP status (so
 * route handlers can pass it through) and the API's RFC 9457 problem details.
 * `message` is the user-facing text: an explicit per-status override, else the
 * API's `detail`, else its `title`, else a generic fallback.
 */
export class ApiError extends HttpError {
  readonly title?: string;
  readonly detail?: string;

  constructor(status: number, message: string, problem?: Problem) {
    super(status, message);
    this.name = "ApiError";
    this.title = problem?.title;
    this.detail = problem?.detail;
  }
}

export const NOT_SIGNED_IN = "Not signed in.";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON-encoded as the request body. */
  body?: unknown;
  /**
   * Who the call acts as. Defaults to the signed-in user (throws a 401 ApiError
   * when there is none). `null` sends no identity (public endpoints).
   */
  as?: Identity | null;
  /** User-facing messages keyed by status; they win over the API's detail. */
  messages?: Partial<Record<number, string>>;
  /** Message when the API gave no detail/title and no override matched. */
  fallback?: string;
}

interface Problem {
  title?: string;
  detail?: string;
}

/** The SSO provider the signed-in session was established through, when the
 *  request acts as that session's user; "" otherwise. */
async function sessionSSOProvider(userId: string): Promise<string> {
  const session = await getSession().catch(() => null);
  if (!session || session.user.id !== userId) return "";
  const id = (session.session as { ssoProviderId?: string | null }).ssoProviderId;
  return typeof id === "string" ? id : "";
}

async function identityFor(as: RequestOptions["as"]): Promise<Identity | null> {
  if (as === null) return null;
  if (as) return as;
  const user = await currentUser();
  if (!user) throw new ApiError(401, NOT_SIGNED_IN);
  return { id: user.id, email: user.email };
}

// Forward the END USER's request context so the API can stamp the audit log's
// "where" (the API only sees the gateway otherwise). Vercel populates the geo
// headers at the edge; x-forwarded-for's first hop is the client.
async function clientContextHeaders(): Promise<Record<string, string>> {
  const h = await headers();
  return {
    "X-Flagon-Client-Ip": (h.get("x-forwarded-for") ?? "").split(",")[0].trim(),
    "X-Flagon-Client-Country": h.get("x-vercel-ip-country") ?? "",
    "X-Flagon-Client-Ua": h.get("user-agent") ?? "",
  };
}

async function toApiError(res: Response, opts: RequestOptions): Promise<ApiError> {
  // Huma answers errors as application/problem+json; tolerate anything else.
  const problem = (await res.json().catch(() => ({}))) as Problem;
  const message =
    opts.messages?.[res.status] ??
    problem.detail ??
    problem.title ??
    opts.fallback ??
    `The request failed (${res.status}).`;
  return new ApiError(res.status, message, problem);
}

/** Send a request and return the raw (successful) Response. */
export async function send(path: string, opts: RequestOptions = {}): Promise<Response> {
  const method = opts.method ?? "GET";
  const identity = await identityFor(opts.as);
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (identity) {
    Object.assign(h, await clientContextHeaders(), {
      Authorization: `Bearer ${internalToken()}`,
      "X-Flagon-User-Id": identity.id,
      "X-Flagon-User-Email": identity.email,
    });
    // How the CURRENT session authenticated: the SSO provider it was established
    // through, if any. The API enforces an org's require-SSO policy from this
    // assertion (it trusts it only alongside the internal token).
    const ssoProvider = await sessionSSOProvider(identity.id);
    if (ssoProvider) h["X-Flagon-Auth-Sso-Provider"] = ssoProvider;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: h,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
    });
  } catch (e) {
    console.error(`[flagon-api] ${method} ${path} unreachable`, e);
    throw new ApiError(503, "The Flagon API is unreachable right now. Try again shortly.");
  }
  if (!res.ok) throw await toApiError(res, opts);
  return res;
}

/** Send a request and decode its JSON body (undefined for an empty body). */
export async function request<T = void>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Like `request`, but a 404 resolves to null instead of throwing: for lookups
 * where "not found" is an expected answer rather than a failure.
 */
export async function requestOrNull<T>(path: string, opts: RequestOptions = {}): Promise<T | null> {
  try {
    return await request<T>(path, opts);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Fetch one page of a keyset-paginated list whose items live under `key`. */
export async function requestPage<T>(
  path: string,
  key: string,
  list?: ListOptions,
  opts: RequestOptions = {},
): Promise<Page<T>> {
  const res = await send(`${path}${listSearch(list)}`, opts);
  const data = (await res.json()) as Record<string, T[] | null | undefined>;
  return { items: data[key] ?? [], next: nextCursor(res.headers.get("Link")) };
}

export function listSearch(opts?: ListOptions): string {
  const qs = new URLSearchParams();
  if (opts?.q) qs.set("q", opts.q);
  if (opts?.cursor) qs.set("cursor", opts.cursor);
  if (opts?.limit) qs.set("limit", String(opts.limit));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

// nextCursor pulls the opaque next-page cursor out of an RFC 5988 Link header's
// rel="next" target, or null when there is no next page. `param` is the cursor's
// query-param name; every list (including the audit log) uses "cursor".
export function nextCursor(link: string | null, param = "cursor"): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    if (!/rel="?next"?/.test(part)) continue;
    const m = part.match(/<([^>]+)>/);
    if (!m) continue;
    try {
      return new URL(m[1], "http://internal").searchParams.get(param);
    } catch {
      return null;
    }
  }
  return null;
}

/** Org-scoped path prefix: `/orgs/<slug>`. */
export const orgPath = (slug: string) => `/orgs/${encodeURIComponent(slug)}`;

/** Project-scoped path prefix: `/orgs/<slug>/projects/<project>`. */
export const projectPath = (slug: string, project: string) =>
  `${orgPath(slug)}/projects/${encodeURIComponent(project)}`;

/** Team-scoped path prefix: `/orgs/<slug>/teams/<team>`. */
export const teamPath = (slug: string, team: string) =>
  `${orgPath(slug)}/teams/${encodeURIComponent(team)}`;
