import { AwsClient } from "aws4fetch";
import { createHash } from "node:crypto";
import {
  configObjectKey,
  type ConfigStore,
  type StoreHead,
  type StoreObject,
} from "./types";

export type S3Config = {
  /** Endpoint origin, e.g. `https://<acct>.r2.cloudflarestorage.com` or `http://localhost:4566`. */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** R2 uses `auto`; a real S3 region otherwise. */
  region: string;
  /** Key prefix for artifacts (default `config`). */
  prefix: string;
};

/** Weak fallback ETag when the store doesn't echo one (kept stable across reads of the same bytes). */
function contentEtag(body: string): string {
  return `"${createHash("sha256").update(body).digest("hex")}"`;
}

/**
 * S3-compatible ConfigStore. One adapter serves Cloudflare R2 (production),
 * ministack/MinIO (compose, tests), and any other S3 endpoint (self-host):
 * all are path-style + custom-endpoint + SigV4, which is exactly what
 * `aws4fetch` signs. aws4fetch is a tiny fetch-only client, so this same file
 * runs unchanged inside a Cloudflare Worker when evaluation moves to the edge.
 */
export function createS3ConfigStore(config: S3Config): ConfigStore {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3",
    // No internal retries: this store sits on the evaluation hot path, where a
    // failed read should fall back to the database immediately rather than
    // retry with backoff. The next request retries the store naturally.
    retries: 0,
  });
  const base = config.endpoint.replace(/\/+$/, "");
  const url = (orgId: string) =>
    `${base}/${config.bucket}/${configObjectKey(config.prefix, orgId)}`;

  // Free the socket without buffering the body on responses we discard.
  const drain = (res: Response) => {
    res.body?.cancel().catch(() => {});
  };

  async function fetchObject(
    orgId: string,
    etag: string | null,
    method: "GET" | "HEAD",
  ): Promise<{ status: number; etag: string | null; res: Response }> {
    const headers: Record<string, string> = {};
    if (etag) headers["if-none-match"] = etag;
    const res = await client.fetch(url(orgId), { method, headers });
    return { status: res.status, etag: res.headers.get("etag"), res };
  }

  return {
    name: `s3(${config.bucket})`,

    async read(orgId, etag): Promise<StoreObject> {
      const { status, etag: responseEtag, res } = await fetchObject(
        orgId,
        etag,
        "GET",
      );
      if (status === 304) {
        drain(res);
        return { status: "not-modified", etag: etag as string };
      }
      if (status === 404) {
        drain(res);
        return { status: "absent" };
      }
      if (!res.ok) {
        drain(res);
        throw new Error(`config store GET ${orgId} -> ${status}`);
      }
      const body = await res.text();
      return { status: "modified", etag: responseEtag ?? contentEtag(body), body };
    },

    async head(orgId, etag): Promise<StoreHead> {
      const { status, etag: responseEtag, res } = await fetchObject(
        orgId,
        etag,
        "HEAD",
      );
      drain(res);
      if (status === 304) return { status: "not-modified", etag: etag as string };
      if (status === 404) return { status: "absent" };
      if (status < 200 || status >= 300)
        throw new Error(`config store HEAD ${orgId} -> ${status}`);
      // A HEAD carries no body to hash; if the endpoint omits an ETag we cannot
      // synthesize one, so report a change and let the caller re-read.
      return { status: "modified", etag: responseEtag ?? `"${Date.now()}"` };
    },

    async write(orgId, body): Promise<string> {
      const res = await client.fetch(url(orgId), {
        method: "PUT",
        body,
        headers: { "content-type": "application/json" },
      });
      const responseEtag = res.headers.get("etag");
      drain(res);
      if (!res.ok) throw new Error(`config store PUT ${orgId} -> ${res.status}`);
      return responseEtag ?? contentEtag(body);
    },
  };
}
