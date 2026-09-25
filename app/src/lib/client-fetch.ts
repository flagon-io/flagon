// Browser-side helper for calling the app's own route handlers (app/api/**).
// Those routes pass the Go API's real status through and answer errors as
// `{ error: string }`; this turns a failed response into an HttpError carrying
// that status and message, so components can render a real error state instead
// of treating a failure as "no items". Client-safe.
import { HttpError } from "@/lib/http-error";

/** The user-facing message from a failed route response, or `fallback`. */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof data?.error === "string" && data.error ? data.error : fallback;
}

/**
 * fetch + JSON decode that throws an HttpError (with the route's status and
 * message) on a non-2xx response. Network failures surface as a 503.
 */
export async function fetchJson<T>(
  input: string,
  init?: RequestInit,
  fallback = "Something went wrong. Try again.",
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new HttpError(503, "Can't reach Flagon right now. Check your connection and try again.");
  }
  if (!res.ok) throw new HttpError(res.status, await errorMessage(res, fallback));
  return (await res.json()) as T;
}

/** A user-facing message for any thrown value. */
export function messageOf(e: unknown, fallback = "Something went wrong. Try again."): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
