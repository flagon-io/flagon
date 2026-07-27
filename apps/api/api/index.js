import { handle } from "@hono/node-server/vercel";
import app from "../dist/index.js";

/**
 * Serverless function entry.
 *
 * In production the API is a request handler, not a long-running server (that's
 * server.ts, for local dev). This serves the compiled Hono app, which the
 * build step (`npm run build`) produces into ../dist; the rewrite in
 * vercel.json sends every path here so the app's own router does the routing.
 *
 * The adapter comes from @hono/node-server/vercel, NOT hono/vercel: this
 * function runs on Vercel's Node runtime, where the request is a Node
 * IncomingMessage. This adapter bridges it into a real Web Request (the same
 * bridge server.ts uses locally) before Hono sees it. hono/vercel is for the
 * Edge/Next runtime and would hand Hono the raw Node object, so any header read
 * (every route, via CORS) throws `this.raw.headers.get is not a function`.
 *
 * It imports the COMPILED output rather than ../src so the bundler never has to
 * resolve the project's NodeNext ".js" import specifiers back to ".ts".
 */
export default handle(app);
