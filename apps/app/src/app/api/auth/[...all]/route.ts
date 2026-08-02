import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/**
 * BetterAuth's catch-all endpoint. Every client call (sign in/up, reset, verify,
 * organization, ...) lands here under /api/auth/*. The handler owns its own
 * routing; we just forward GET and POST to it.
 */
export const { GET, POST } = toNextJsHandler(auth);
