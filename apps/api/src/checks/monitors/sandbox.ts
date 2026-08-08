import { fork, type ChildProcess, type Serializable } from "node:child_process";
import { tmpdir } from "node:os";

/**
 * The sandbox in which a tenant's browser-check script runs. It is NOT run in-process: a
 * tenant script is untrusted code, so it executes in a SEPARATE child process that is
 * locked down two ways:
 *
 *   1. A CLEAN environment — only the handful of non-secret runtime vars below are passed,
 *      so DB creds, CRON_SECRET, mail/Stripe keys, etc. are simply ABSENT from the child's
 *      `process.env` (not deleted-and-restored — never present).
 *   2. Node's PERMISSION MODEL — the child starts with `--permission` (deny fs-write,
 *      child_process, worker, native addons); only fs-READ is allowed so it can load its
 *      own modules. Network is not gated by the model, so SSRF is enforced at the request
 *      layer (net-guard) instead.
 *
 * A worker_thread can't do this — threads share the process and its permissions — so a
 * child process is the boundary. This same model moves cleanly to a per-run container on
 * the future runner; there the container is the outer boundary and this is defense-in-depth.
 */

/** Non-secret runtime env kept for the child; everything else is absent. */
export const SAFE_ENV = [
  "PATH",
  "HOME",
  "PWD",
  "TMP",
  "TMPDIR",
  "TEMP",
  "LANG",
  "LC_ALL",
  "TZ",
  "NODE_ENV",
  "SHLVL",
] as const;

export function sandboxEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SAFE_ENV) {
    const v = process.env[k];
    if (v != null) out[k] = v;
  }
  return out;
}

/**
 * The directories the sandboxed child may READ — ONLY what it needs to load its own code +
 * playwright: the app root (dist + node_modules) and the temp dir. Everything else is
 * denied — crucially `/proc/<ppid>/environ`, which on Linux would otherwise leak the PARENT
 * process's environment (DB creds, CRON_SECRET, …) even though the child's OWN env is clean.
 * Scoping reads is what makes the clean env airtight.
 */
export function sandboxReadRoots(): string[] {
  return [...new Set([process.cwd(), tmpdir()])];
}

/**
 * Permission-model flags for the child. The flag was renamed from
 * `--experimental-permission` to `--permission` when it stabilized in Node 23.5, so pick by
 * runtime version READ AT RUNTIME (never hardcoded): the child inherits the parent's Node
 * binary, so this is always correct for whatever the host runs. Verified target: the repo's
 * root `engines.node` is `>=24.0.0`, so Vercel runs Node 24.x (a lower runtime hard-fails
 * the build) → `--permission`. On an older host (20–23) it degrades to
 * `--experimental-permission` automatically. fs-READ is scoped (see sandboxReadRoots);
 * fs-write, child_process, worker, and native addons stay denied entirely.
 */
export function sandboxExecArgv(): string[] {
  const major = Number(process.versions.node.split(".")[0]);
  const flag = major >= 23 ? "--permission" : "--experimental-permission";
  return [flag, ...sandboxReadRoots().flatMap((r) => [`--allow-fs-read=${r}`, `--allow-fs-read=${r}/*`])];
}

export type SandboxResult = { ok: boolean; message?: string };

/**
 * Fork `childPath` under the sandbox (clean env + permission model), send it `payload` over
 * IPC, and resolve with its `{ ok, message }` reply. Kills the child on timeout or any
 * failure. NEVER rejects — a sandbox that can't start is a failing result, never an
 * unsandboxed fallback.
 */
export function runInSandbox(childPath: string, payload: Serializable, timeoutMs: number): Promise<SandboxResult> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = fork(childPath, [], {
        env: sandboxEnv(),
        execArgv: sandboxExecArgv(),
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
    } catch (err) {
      resolve({ ok: false, message: err instanceof Error ? err.message : "The sandbox could not start." });
      return;
    }

    let done = false;
    const finish = (r: SandboxResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, message: "The browser script timed out." }), timeoutMs);
    child.once("message", (m) => finish((m as SandboxResult) ?? { ok: false, message: "No result from sandbox." }));
    child.once("error", (e) => finish({ ok: false, message: e.message }));
    child.once("exit", (code) => finish({ ok: false, message: `The sandbox exited early (code ${code}).` }));
    try {
      child.send(payload);
    } catch (err) {
      finish({ ok: false, message: err instanceof Error ? err.message : "Could not hand off to the sandbox." });
    }
  });
}
