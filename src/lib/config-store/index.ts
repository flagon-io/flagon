import { join } from "node:path";
import { createFsConfigStore } from "./fs";
import { createS3ConfigStore } from "./s3";
import type { ConfigStore } from "./types";

export type { ConfigStore, StoreHead, StoreObject } from "./types";

/**
 * Resolve the process-wide ConfigStore from the environment. The store is a
 * derived cache; nothing here is required for correctness (the OFREP path falls
 * back to the database), so an absent or misconfigured store means "read the
 * database directly", never a crash.
 *
 * Selection:
 *   FLAGON_CONFIG_STORE=off              -> no store (read the database each time)
 *   FLAGON_CONFIG_STORE=s3 | S3 vars set -> S3/R2 adapter (production, compose)
 *   FLAGON_CONFIG_STORE=fs | *_DIR set   -> local filesystem adapter
 *   (nothing set), long-lived server     -> local filesystem (self-host, dev)
 *   (nothing set), serverless            -> no store (configure R2 for the edge)
 *
 * The serverless default is deliberately "no store": a filesystem store on a
 * multi-instance serverless platform would write to per-instance ephemeral
 * disk and never converge. There, R2 is the intended configuration.
 */
function resolveConfigStore(): ConfigStore | null {
  const env = process.env;
  const mode = env.FLAGON_CONFIG_STORE?.trim().toLowerCase();
  if (mode === "off" || mode === "none") return null;

  // Key prefix namespaces this product's artifacts within a shared bucket, so a
  // future configuration-storage product can live in the same bucket under its
  // own prefix. Default: the flag-evaluation artifacts live under `flags/`.
  const prefix = env.FLAGON_CONFIG_STORE_PREFIX?.trim() || "flags";
  const endpoint = env.FLAGON_CONFIG_STORE_ENDPOINT?.trim();
  const bucket = env.FLAGON_CONFIG_STORE_BUCKET?.trim();
  const accessKeyId = env.FLAGON_CONFIG_STORE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.FLAGON_CONFIG_STORE_SECRET_ACCESS_KEY?.trim();
  const region = env.FLAGON_CONFIG_STORE_REGION?.trim() || "auto";
  const s3Configured = Boolean(
    endpoint && bucket && accessKeyId && secretAccessKey,
  );

  if (mode === "s3" || (!mode && s3Configured)) {
    if (!s3Configured)
      throw new Error(
        "FLAGON_CONFIG_STORE=s3 requires FLAGON_CONFIG_STORE_ENDPOINT, " +
          "_BUCKET, _ACCESS_KEY_ID and _SECRET_ACCESS_KEY.",
      );
    return createS3ConfigStore({
      endpoint: endpoint!,
      bucket: bucket!,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      region,
      prefix,
    });
  }

  const dir = env.FLAGON_CONFIG_STORE_DIR?.trim();
  if (mode === "fs" || dir)
    return createFsConfigStore(dir || defaultFsDir());

  // Nothing configured. On serverless, prefer the database over a per-instance
  // disk that cannot converge; elsewhere, the local filesystem is a good default.
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) return null;
  return createFsConfigStore(defaultFsDir());
}

function defaultFsDir(): string {
  return join(process.cwd(), ".flagon", "config-store");
}

const globalForStore = globalThis as typeof globalThis & {
  __flagonConfigStore?: { store: ConfigStore | null };
};

/** The resolved ConfigStore for this process, or null when reads should hit the database. */
export function getConfigStore(): ConfigStore | null {
  const cached = globalForStore.__flagonConfigStore;
  if (cached) return cached.store;
  const store = resolveConfigStore();
  globalForStore.__flagonConfigStore = { store };
  return store;
}

/** Test seam: drop the memoized store so the next call re-reads the environment. */
export function resetConfigStore(): void {
  delete globalForStore.__flagonConfigStore;
}
