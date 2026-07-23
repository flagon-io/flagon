/**
 * A ConfigStore holds one precomputed evaluation artifact per organization: a
 * JSON document with every flag and segment the OFREP hot path needs. It is a
 * DERIVED cache in front of the database (the source of truth), never a second
 * source of truth - every read is best-effort and the evaluation path falls
 * back to a direct database read whenever a call returns `absent` or throws.
 *
 * The interface is deliberately byte-oriented (an opaque JSON string, an opaque
 * ETag) so an adapter needs to know nothing about flags or segments, and so the
 * exact same three calls port unchanged to a Cloudflare Worker reading R2.
 *
 * Freshness without LISTEN/NOTIFY: reads are conditional on the caller's last
 * ETag. `read`/`head` return `not-modified` when the stored object still
 * matches, so a caller keeps its parsed copy and pays no transfer; they return
 * `modified` (with a new ETag and, for `read`, the body) the moment a `write`
 * has replaced it. The store is the single point that changes propagate
 * through - a save writes here, the next read here sees it.
 */

/** Result of a conditional object read. */
export type StoreObject =
  | { status: "modified"; etag: string; body: string }
  | { status: "not-modified"; etag: string }
  | { status: "absent" };

/** Result of a conditional existence/version check that transfers no body. */
export type StoreHead =
  | { status: "modified"; etag: string }
  | { status: "not-modified"; etag: string }
  | { status: "absent" };

export interface ConfigStore {
  /** Human-readable adapter identity, for logs (e.g. `s3(flagon-config)`). */
  readonly name: string;
  /**
   * Fetch the org's artifact. Pass the ETag of the copy you already hold to get
   * `not-modified` (and skip the transfer) when nothing has changed; pass null
   * to force a full read.
   */
  read(orgId: string, etag: string | null): Promise<StoreObject>;
  /**
   * Like {@link read} but transfers no body - just whether the artifact exists
   * and its current ETag. Used to poll for change detection cheaply.
   */
  head(orgId: string, etag: string | null): Promise<StoreHead>;
  /** Publish (overwrite) the org's artifact. Returns the new ETag. */
  write(orgId: string, body: string): Promise<string>;
}

/**
 * The object key for an org's artifact. One mutable object per org: R2 (and
 * MinIO/ministack) are strongly consistent for read-after-write, so an
 * overwrite is visible to the next read without a version pointer.
 */
export function configObjectKey(prefix: string, orgId: string): string {
  return `${prefix.replace(/\/+$/, "")}/${orgId}.json`;
}
