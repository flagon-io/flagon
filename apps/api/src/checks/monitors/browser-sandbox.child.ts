import { classifyIp } from "../net-guard.js";

/**
 * The sandboxed child that actually runs a tenant's browser-check script (see sandbox.ts
 * for the isolation it starts under: clean env + Node permission model). It receives the
 * job over IPC, CONNECTS to a browser server the parent launched (never launches one
 * itself), aborts any browser request to a private/internal host, runs the script, and
 * replies with the outcome. It trusts nothing in the script.
 *
 * playwright-core is imported via a runtime-assembled specifier so the bundler's tracer
 * doesn't pull Chromium into the main API function — only the dedicated browser function
 * (which imports it statically) carries it.
 */

type Job = { wsEndpoint?: string; script: string; location?: string; testMode?: boolean };

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

function reply(r: { ok: boolean; message?: string }): void {
  process.send?.(r);
  // Let IPC flush, then exit so the process never lingers.
  setTimeout(() => process.exit(r.ok ? 0 : 1), 50);
}

process.once("message", async (job: Job) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let page: any = {};
    if (!job.testMode) {
      if (!job.wsEndpoint) throw new Error("No browser endpoint was provided to the sandbox.");
      const playwrightPkg = ["playwright", "core"].join("-");
      const { chromium } = await import(/* @vite-ignore */ playwrightPkg);
      browser = await chromium.connect(job.wsEndpoint);
      const context = await browser.newContext();
      // SSRF at the request layer: abort any navigation/subrequest to a private/internal
      // IP literal (cloud metadata, loopback, RFC1918, …). The runner's network is the
      // outer boundary; this is defense-in-depth within it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await context.route("**/*", async (route: any) => {
        try {
          const host = new URL(route.request().url()).hostname.replace(/^\[|\]$/g, "");
          if (classifyIp(host)) {
            await route.abort("blockedbyclient");
            return;
          }
        } catch {
          // Unparseable URL — let Playwright handle it.
        }
        await route.continue();
      });
      page = await context.newPage();
    }

    const fn = new AsyncFunction("page", "context", job.script);
    await fn(page, { location: job.location });
    reply({ ok: true });
  } catch (err) {
    reply({ ok: false, message: err instanceof Error ? err.message : "The browser script failed." });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
});
