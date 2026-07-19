import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/**
 * BetterAuth handler. Mounted at /api/auth/* (locally) and api.flagon.io/auth/*
 * in production. More specific than /api/[...catchall], so it takes precedence.
 */
export const { GET, POST } = toNextJsHandler(auth);
