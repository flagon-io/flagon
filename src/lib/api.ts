import { NextResponse } from "next/server";

/**
 * Helpers to keep every API response (success or error) a consistent JSON
 * envelope. The API surface (api.flagon.io, locally /api) must NEVER return
 * HTML, even for 404s and unhandled errors.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function apiJson(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: { ...NO_STORE, ...(init?.headers ?? {}) },
  });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status, headers: NO_STORE },
  );
}

export const apiNotFound = () =>
  apiError(404, "not_found", "The requested API endpoint does not exist.");

export const apiMethodNotAllowed = () =>
  apiError(405, "method_not_allowed", "This method is not allowed on this endpoint.");
