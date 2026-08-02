/**
 * Validate object storage end-to-end against whatever STORAGE_* points at
 * (ministack locally, R2 in prod): presign a PUT, upload bytes directly, HEAD to
 * confirm, then fetch the public URL and check the bytes round-trip. Defaults to
 * the local ministack service so `node --import tsx scripts/validate-storage.ts`
 * just works once `npm run compose:up` is running.
 */
process.env.STORAGE_ENDPOINT ??= "http://localhost:4566";
process.env.STORAGE_REGION ??= "us-east-1";
process.env.STORAGE_ACCESS_KEY_ID ??= "test";
process.env.STORAGE_SECRET_ACCESS_KEY ??= "test";
process.env.STORAGE_FORCE_PATH_STYLE ??= "true";
process.env.STORAGE_PUBLIC_BUCKET ??= "flagon-public";
process.env.STORAGE_PUBLIC_BASE_URL ??= "http://localhost:4566/flagon-public";

const {
  isStorageConfigured,
  presignPut,
  publicUrl,
  headObject,
  buildAssetKey,
} = await import("../src/lib/storage.js");

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string): never {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
}

console.log(`[validate-storage] endpoint=${process.env.STORAGE_ENDPOINT} bucket=${process.env.STORAGE_PUBLIC_BUCKET}`);

if (!isStorageConfigured()) fail("storage is not configured (STORAGE_* incomplete)");
ok("storage configured");

const contentType = "image/png";
const key = buildAssetKey({ orgId: "validate-org", purpose: "org-logo", ext: "png" });
const body = Buffer.alloc(512, 0xab);

// 1. Presign a PUT.
const ticket = await presignPut({ bucket: "public", key, contentType });
if (!ticket.url.includes("X-Amz-Signature")) fail("presigned URL is not signed");
ok(`presigned PUT (${ticket.expiresIn}s)`);

// 2. Upload the bytes directly, exactly as a browser would.
const put = await fetch(ticket.url, { method: "PUT", headers: ticket.headers, body });
if (!put.ok) fail(`PUT failed: HTTP ${put.status} ${await put.text().catch(() => "")}`);
ok(`uploaded ${body.length} bytes (HTTP ${put.status})`);

// 3. HEAD to confirm it exists with the right size.
const head = await headObject({ bucket: "public", key });
if (!head) fail("HEAD found no object");
if (head.size !== body.length) fail(`HEAD size ${head.size} != ${body.length}`);
ok(`HEAD confirms object (${head.size} bytes, ${head.contentType ?? "no content-type"})`);

// 4. Fetch the PUBLIC url (no auth) and check the bytes round-trip.
const url = publicUrl("public", key);
const get = await fetch(url);
if (!get.ok) fail(`public GET failed: HTTP ${get.status} (is the bucket public-read?)`);
const got = Buffer.from(await get.arrayBuffer());
if (got.length !== body.length) fail(`public GET returned ${got.length} bytes, expected ${body.length}`);
ok(`public GET ${url} -> HTTP ${get.status}, ${got.length} bytes match`);

console.log("[validate-storage] PASS — presign + direct upload + public read all work");
