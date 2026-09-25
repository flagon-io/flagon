// Shared error responder for the app's route handlers (app/api/**). The gateway
// throws a typed ApiError carrying the Go API's real status; this passes that
// status straight through (401 not signed in, 403, 404, 409, 422, 429, 5xx)
// instead of flattening everything to 400, so client code can tell "you can't do
// that" from "the platform is down".
import { NextResponse } from "next/server";
import { HttpError } from "@/lib/http-error";

export function routeError(e: unknown, fallback = "Something went wrong. Try again.") {
  if (e instanceof HttpError) {
    const status = e.status >= 400 && e.status <= 599 ? e.status : 502;
    return NextResponse.json({ error: e.message || fallback }, { status });
  }
  console.error("[route]", e);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** A 400 for a request the route itself rejects (bad/missing input). */
export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/** Read list options (?q=&cursor=&limit=) off a route handler's request URL. */
export function listOptionsFrom(request: Request) {
  const sp = new URL(request.url).searchParams;
  const limit = sp.get("limit");
  return {
    q: sp.get("q") ?? undefined,
    cursor: sp.get("cursor") ?? undefined,
    limit: limit ? Number(limit) : undefined,
  };
}
