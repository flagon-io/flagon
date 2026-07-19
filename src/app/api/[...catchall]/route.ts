import { apiNotFound } from "@/lib/api";

/**
 * Catch-all for any unmatched API path. Guarantees a JSON 404 (never HTML) for
 * unknown endpoints under /api. More specific routes take precedence over this.
 */
export const dynamic = "force-dynamic";

export const GET = apiNotFound;
export const POST = apiNotFound;
export const PUT = apiNotFound;
export const PATCH = apiNotFound;
export const DELETE = apiNotFound;
export const OPTIONS = apiNotFound;
