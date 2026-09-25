// Request-scoped session lookup. Wrapped in React `cache()` so a single render
// (the [org] layout plus the page plus any nested server component) resolves the
// BetterAuth session once instead of once per caller. Outside a React render
// (route handlers) `cache` is a plain passthrough, which is fine.
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** The signed-in user, or null. */
export const currentUser = cache(async () => (await getSession())?.user ?? null);
