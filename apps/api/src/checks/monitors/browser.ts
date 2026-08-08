import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { MonitorType, RunResult } from "./types.js";
import { thresholdMs } from "./types.js";
import { runInSandbox } from "./sandbox.js";

/**
 * Browser check — a full headless-Chromium probe running a Playwright script
 * (Checkly's Browser check). Simulates a real user flow: navigate, interact,
 * assert. It has NO degraded state — a browser run either completes its script
 * (passing) or throws/times out (failing).
 *
 * This adapter is `runner: "browser"`: the scheduler dispatches it to the ISOLATED
 * browser Vercel function (api/checks-browser.ts), never the main API path. The
 * heavy deps (`playwright-core` + `@sparticuz/chromium`) are imported lazily here
 * so they are bundled only into that function and never weigh down the hot path.
 *
 * SECURITY: a tenant script is UNTRUSTED code. This adapter launches Chromium as a
 * SERVER, then runs the script in a locked-down child process (sandbox.ts: clean env
 * + Node permission model) that merely CONNECTS to that browser over a websocket. The
 * script never shares this process's env or capabilities, and every browser request to
 * a private/internal host is aborted (net-guard). Same model moves to a per-run
 * container on the future runner.
 *
 * Runs under the "synthetic" family and meters at the browser rate — ~25x a URL
 * run, matching Checkly's pricing asymmetry.
 */

const browserConfigSchema = z.object({
  /** The Playwright script. Runs as an async function body with `page` in scope. */
  script: z.string().min(1).describe("Playwright script; `page` is in scope."),
  /** The run fails if the script hasn't finished within this many ms (cap 30s). */
  timeoutMs: thresholdMs.default(30_000),
});

export type BrowserConfig = z.infer<typeof browserConfigSchema>;

/** Launch serverless Chromium as a SERVER (a wsEndpoint the sandboxed child connects to),
 *  or null if unavailable (deps not installed / runtime can't launch). The specifiers are
 *  assembled at runtime so the bundler's static tracer does NOT pull ~50MB of Chromium into
 *  the main API function — only the dedicated browser function carries it. */
async function launchServer(): Promise<{ wsEndpoint: string; close: () => Promise<void> } | null> {
  try {
    const chromiumPkg = ["@sparticuz", "chromium"].join("/");
    const playwrightPkg = ["playwright", "core"].join("-");
    const [chromiumMod, playwrightMod] = await Promise.all([
      import(/* @vite-ignore */ chromiumPkg),
      import(/* @vite-ignore */ playwrightPkg),
    ]);
    const chromium = chromiumMod.default ?? chromiumMod;
    const playwright = playwrightMod.chromium ?? playwrightMod.default?.chromium;
    const server = await playwright.launchServer({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    return { wsEndpoint: server.wsEndpoint(), close: () => server.close() };
  } catch {
    return null;
  }
}

// The sandboxed child that runs the tenant script (compiled sibling of this file).
const CHILD = fileURLToPath(new URL("./browser-sandbox.child.js", import.meta.url));

export const browserMonitor: MonitorType<BrowserConfig> = {
  key: "browser",
  label: "Browser check",
  summary: "Check your crucial browser click flows with a Playwright script.",
  family: "synthetic",
  runner: "browser",
  supportsDegraded: false,
  billingSource: "checks.browser",
  configSchema: browserConfigSchema,
  defaults: { timeoutMs: 30_000 },

  async run(config, ctx) {
    const timeout = config.timeoutMs ?? this.defaults.timeoutMs;
    const started = performance.now();

    const server = await launchServer();
    if (!server) {
      return {
        status: "failing",
        latencyMs: Math.round(performance.now() - started),
        error: {
          code: "runtime_unavailable",
          message: "The browser runtime is not available on this deployment.",
        },
      } satisfies RunResult;
    }

    try {
      // The script runs in the sandboxed child, which connects to the browser over the
      // wsEndpoint. Budget the child a little beyond the script timeout for connect/setup.
      const result = await runInSandbox(
        CHILD,
        { wsEndpoint: server.wsEndpoint, script: config.script, location: ctx.location },
        timeout + 10_000,
      );
      return result.ok
        ? { status: "passing", latencyMs: Math.round(performance.now() - started) }
        : {
            status: "failing",
            latencyMs: Math.round(performance.now() - started),
            error: { code: "script_error", message: result.message ?? "The browser script failed." },
          };
    } finally {
      await server.close().catch(() => undefined);
    }
  },
};
