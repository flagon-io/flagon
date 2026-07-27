import { cors } from "hono/cors";

/**
 * Open CORS, on purpose.
 *
 * The API is a public, token-authenticated control plane, so — like a public
 * REST API — it serves browsers from any origin. Auth travels in the
 * `Authorization` header, which a browser never attaches automatically, so
 * there is nothing for a hostile origin to ride on: the combination that is
 * actually dangerous is `Access-Control-Allow-Origin: *` TOGETHER WITH
 * credentials, and we deliberately do not allow credentials. No cookie is ever
 * part of a cross-origin call here.
 */
export const openCors = cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 86400,
});
