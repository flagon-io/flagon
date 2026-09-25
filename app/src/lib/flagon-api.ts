// Server-side gateway to the Go API (barrel). The implementation lives in
// lib/api/*: `client.ts` is the single request path (identity headers, JSON,
// problem+json error parsing into a typed ApiError that keeps the upstream
// status), and the resource modules are thin typed wrappers over it. Never
// import this from client code; "use client" files import shapes from
// `@/lib/api/types` instead.
export * from "./api/types";
export { ApiError, NOT_SIGNED_IN, type Identity } from "./api/client";
export * from "./api/orgs";
export * from "./api/projects";
export * from "./api/members";
export * from "./api/audit";
export * from "./api/tokens";
export * from "./api/notifications";
