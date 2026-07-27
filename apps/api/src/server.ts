import { serve } from "@hono/node-server";
import app from "./index.js";

// Local entrypoint: run the Hono app with a plain Node HTTP server so
// `npm run dev` / `npm start` work with nothing but Node installed.
const port = Number(process.env.PORT ?? 3002);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Flagon API running on http://localhost:${info.port}`);
});
