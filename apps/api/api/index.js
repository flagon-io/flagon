import { handle } from "hono/vercel";
import app from "../dist/index.js";

/**
 * Serverless function entry.
 *
 * In production the API is a request handler, not a long-running server (that's
 * server.ts, for local dev). This serves the compiled Hono app, which the
 * build step (`npm run build`) produces into ../dist; the rewrite in
 * vercel.json sends every path here so the app's own router does the routing.
 *
 * It imports the COMPILED output rather than ../src so the bundler never has to
 * resolve the project's NodeNext ".js" import specifiers back to ".ts".
 */
export default handle(app);
