import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runInSandbox, sandboxEnv, sandboxExecArgv, SAFE_ENV } from "./sandbox.js";

/**
 * Proves the browser-check sandbox is a REAL boundary, not defense-in-depth theater. A
 * probe mirrors the child's execution model (run a tenant script via AsyncFunction) and is
 * forked through `runInSandbox` under the exact production config (clean env + Node
 * permission model). We then run hostile scripts and assert they can't reach secrets, write
 * files, or spawn processes. This runs on the same Node MAJOR as Vercel (24), so the
 * permission boundary here is the one that ships.
 */
describe("browser sandbox isolation", () => {
  let dir: string;
  let probe: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "flagon-sbx-"));
    probe = join(dir, "probe.mjs");
    // Mirrors browser-sandbox.child.ts: receive a job, run the script, reply {ok,message}.
    writeFileSync(
      probe,
      `process.once("message", async (job) => {
         const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
         try {
           const fn = new AsyncFunction("page", "context", job.script);
           const r = await fn({}, {});
           process.send({ ok: true, message: r == null ? "" : String(r) });
         } catch (err) {
           process.send({ ok: false, message: err && err.message ? err.message : String(err) });
         }
         setTimeout(() => process.exit(0), 30);
       });\n`,
    );
    process.env.FLAGON_SANDBOX_SECRET = "leak-me-if-you-can";
  });

  afterAll(() => {
    delete process.env.FLAGON_SANDBOX_SECRET;
    rmSync(dir, { recursive: true, force: true });
  });

  it("picks the permission flag from the runtime, and scopes fs-read (never '*')", () => {
    const argv = sandboxExecArgv();
    const major = Number(process.versions.node.split(".")[0]);
    expect(argv).toContain(major >= 23 ? "--permission" : "--experimental-permission");
    // Scoped to the app + temp roots — NOT "*", so /proc/<ppid>/environ stays unreadable.
    expect(argv).not.toContain("--allow-fs-read=*");
    expect(argv.some((a) => a.startsWith("--allow-fs-read="))).toBe(true);
  });

  it("never passes secrets into the child env", () => {
    const env = sandboxEnv();
    expect(env.FLAGON_SANDBOX_SECRET).toBeUndefined();
    for (const k of Object.keys(env)) expect(SAFE_ENV).toContain(k);
  });

  it("runs a benign script and returns its value", async () => {
    const r = await runInSandbox(probe, { script: "return 'hello ' + (1+1)" }, 5000);
    expect(r.ok).toBe(true);
    expect(r.message).toBe("hello 2");
  });

  it("hides parent secrets from a hostile script (clean env)", async () => {
    const r = await runInSandbox(probe, { script: "return process.env.FLAGON_SANDBOX_SECRET || 'ABSENT'" }, 5000);
    expect(r.ok).toBe(true);
    expect(r.message).toBe("ABSENT");
  });

  it("denies filesystem WRITES (permission model)", async () => {
    const script = `const fs = await import('node:fs'); fs.writeFileSync('${dir.replace(/\\/g, "/")}/pwned.txt', 'x'); return 'WROTE';`;
    const r = await runInSandbox(probe, { script }, 5000);
    expect(r.ok).toBe(false);
    expect(r.message).not.toBe("WROTE");
  });

  it("denies reads OUTSIDE the app/temp roots (closes /proc/<ppid>/environ)", async () => {
    // The Node binary lives outside cwd + tmp, standing in for /proc/<ppid>/environ: a
    // read of it must be denied, proving fs-read is scoped rather than "*".
    const script = `const fs = await import('node:fs'); fs.readFileSync(process.execPath); return 'READ';`;
    const r = await runInSandbox(probe, { script }, 5000);
    expect(r.ok).toBe(false);
    expect(r.message).not.toBe("READ");
  });

  it("denies spawning child processes (permission model)", async () => {
    const script = `const cp = await import('node:child_process'); cp.execSync('echo pwned'); return 'SPAWNED';`;
    const r = await runInSandbox(probe, { script }, 5000);
    expect(r.ok).toBe(false);
    expect(r.message).not.toBe("SPAWNED");
  });

  it("kills a script that exceeds its timeout", async () => {
    // A long timer keeps the child alive (like a real hung page interaction) so the
    // parent's timeout is what ends it.
    const r = await runInSandbox(probe, { script: "await new Promise((res) => setTimeout(res, 60000))" }, 500);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/timed out/i);
  });
});
