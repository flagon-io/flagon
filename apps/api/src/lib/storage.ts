import { AwsClient } from "aws4fetch";

/**
 * Object storage (Cloudflare R2 / any S3-compatible store, e.g. ministack
 * locally). Modeled on stripe.ts: nothing is read at module load; a lazy cached
 * client is built on first use; `isStorageConfigured()` lets callers degrade to
 * a 503 when storage is off.
 *
 * MULTI-BUCKET BY DESIGN. Code addresses buckets by a LOGICAL id (`"public"`
 * today; `"private"`/scaling buckets later) via `getBucket()`. Nothing outside
 * this file knows a physical bucket name or base URL, so adding a second bucket
 * is one registry entry with zero call-site churn — and because every asset row
 * stores its logical bucket id, existing assets never need backfilling when a
 * new bucket is introduced.
 *
 * Bytes never flow through this API: callers presign a PUT and the browser
 * uploads directly to the store. We only sign URLs and HEAD objects to confirm.
 */

// --- Bucket registry --------------------------------------------------------

export type BucketVisibility = "public" | "private";
/** Logical bucket ids. Extend this union as buckets are provisioned. */
export type BucketId = "public";

export type BucketConfig = {
  id: BucketId;
  /** The real bucket name in the store. */
  physical: string;
  visibility: BucketVisibility;
  /** Where objects are served publicly (public buckets only; null otherwise). */
  publicBaseUrl: string | null;
};

function buildRegistry(): Record<BucketId, BucketConfig> | null {
  const physical = process.env.STORAGE_PUBLIC_BUCKET;
  const publicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL;
  if (!physical || !publicBaseUrl) return null;
  return {
    public: {
      id: "public",
      physical,
      visibility: "public",
      publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
    },
  };
}

let registryCache: Record<BucketId, BucketConfig> | null | undefined;
function registry(): Record<BucketId, BucketConfig> | null {
  if (registryCache === undefined) registryCache = buildRegistry();
  return registryCache;
}

/** True when storage is fully configured; false = uploads should 503. */
export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.STORAGE_ENDPOINT &&
      process.env.STORAGE_ACCESS_KEY_ID &&
      process.env.STORAGE_SECRET_ACCESS_KEY &&
      registry(),
  );
}

/** The config for a logical bucket. Throws if storage/bucket isn't configured. */
export function getBucket(id: BucketId): BucketConfig {
  const cfg = registry()?.[id];
  if (!cfg) throw new Error(`Storage bucket "${id}" is not configured.`);
  return cfg;
}

// --- Signing client (aws4fetch) ---------------------------------------------

let cachedClient: AwsClient | null = null;
function client(): AwsClient {
  if (cachedClient) return cachedClient;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Object storage is not configured (missing STORAGE credentials).");
  }
  cachedClient = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region: process.env.STORAGE_REGION || "auto",
    service: "s3",
  });
  return cachedClient;
}

function endpoint(): string {
  const e = process.env.STORAGE_ENDPOINT;
  if (!e) throw new Error("Object storage is not configured (missing STORAGE_ENDPOINT).");
  return e.replace(/\/+$/, "");
}

/** ministack + R2 both accept path-style; virtual-host is opt-in. */
function forcePathStyle(): boolean {
  return (process.env.STORAGE_FORCE_PATH_STYLE ?? "true") !== "false";
}

/** Percent-encode each key segment, preserving the slashes. */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/** The S3 API URL for an object, used for signing (NOT the public URL). */
function objectApiUrl(physical: string, key: string): string {
  const ek = encodeKey(key);
  if (forcePathStyle()) return `${endpoint()}/${physical}/${ek}`;
  const u = new URL(endpoint());
  return `${u.protocol}//${physical}.${u.host}/${ek}`;
}

// --- Operations -------------------------------------------------------------

export type PresignedUpload = {
  url: string;
  method: "PUT";
  /** Headers the browser MUST send on the PUT (they're part of the signature). */
  headers: Record<string, string>;
  expiresIn: number;
};

/**
 * A presigned PUT URL for a direct browser upload. `contentType` is signed, so
 * the browser must send exactly that Content-Type (we return it in `headers`).
 */
export async function presignPut(opts: {
  bucket: BucketId;
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<PresignedUpload> {
  const cfg = getBucket(opts.bucket);
  const expiresIn = opts.expiresIn ?? 600;
  const url = new URL(objectApiUrl(cfg.physical, opts.key));
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await client().sign(url.toString(), {
    method: "PUT",
    headers: { "content-type": opts.contentType },
    aws: { signQuery: true },
  });
  return {
    url: signed.url,
    method: "PUT",
    headers: { "Content-Type": opts.contentType },
    expiresIn,
  };
}

/** The public URL an object is served from (public buckets only). */
export function publicUrl(bucketId: BucketId, key: string): string {
  const cfg = getBucket(bucketId);
  if (!cfg.publicBaseUrl) {
    throw new Error(`Bucket "${bucketId}" is private; it has no public URL.`);
  }
  return `${cfg.publicBaseUrl}/${encodeKey(key)}`;
}

/** HEAD an object to confirm it exists (post-upload). Null if absent. */
export async function headObject(opts: {
  bucket: BucketId;
  key: string;
}): Promise<{ size: number; contentType: string | null } | null> {
  const cfg = getBucket(opts.bucket);
  const res = await client().fetch(objectApiUrl(cfg.physical, opts.key), {
    method: "HEAD",
  });
  if (!res.ok) return null;
  return {
    size: Number(res.headers.get("content-length") ?? "0"),
    contentType: res.headers.get("content-type"),
  };
}

/**
 * A namespaced object key: `org/<orgId>/<purpose>/<uuid>.<ext>`. Namespacing by
 * org + purpose keeps a future bucket split (by prefix) mechanical.
 */
export function buildAssetKey(opts: {
  orgId: string;
  purpose: string;
  ext: string;
}): string {
  return `org/${opts.orgId}/${opts.purpose}/${crypto.randomUUID()}.${opts.ext}`;
}
