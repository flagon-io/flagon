import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg } from "../../db/tenant.js";
import { assets } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import {
  isStorageConfigured,
  getBucket,
  presignPut,
  publicUrl,
  headObject,
  buildAssetKey,
  type BucketId,
} from "../../lib/storage.js";

/**
 * Uploads. Mounted at /v1/orgs/:org/uploads. Presigned direct-to-bucket: the
 * client asks for a signed PUT (POST /), uploads the bytes straight to the store,
 * then confirms (POST /:id/complete). Bytes never pass through the API.
 *
 * Storage is OPTIONAL. When it isn't configured the write endpoints return 503
 * and GET /config reports `enabled: false`, so the console can render the feature
 * present-but-disabled without any secrets set.
 */
export const uploads_ = new Hono();
uploads_.use("*", authContext);

const TAG = "Uploads";

// Accepted image types → file extension. Raster only (no SVG: it can carry
// script and these are served from a public origin).
const ACCEPTED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const ACCEPTED_TYPES = Object.keys(ACCEPTED) as [string, ...string[]];

// What can be uploaded, and where it goes. Each purpose maps to a logical bucket
// + a size cap; add project screenshots / avatars here without touching storage.
const ORG_LOGO_MAX = 2 * 1024 * 1024; // 2 MB
const PURPOSES = {
  "org-logo": { bucket: "public" as BucketId, maxSizeBytes: ORG_LOGO_MAX },
  "project-icon": { bucket: "public" as BucketId, maxSizeBytes: ORG_LOGO_MAX },
} as const;
type Purpose = keyof typeof PURPOSES;
const PURPOSE_KEYS = Object.keys(PURPOSES) as [Purpose, ...Purpose[]];
const MAX_ANY = Math.max(...Object.values(PURPOSES).map((p) => p.maxSizeBytes));

const presignBody = z.object({
  purpose: z.enum(PURPOSE_KEYS),
  contentType: z.enum(ACCEPTED_TYPES),
  size: z.number().int().positive().max(MAX_ANY),
});

function serializeAsset(a: typeof assets.$inferSelect) {
  const bucketId = a.bucket as BucketId;
  const isPublic = a.visibility === "public";
  return {
    id: a.id,
    purpose: a.purpose,
    contentType: a.contentType,
    size: a.sizeBytes,
    status: a.status,
    // Public buckets serve a stable URL; private assets would presign a GET
    // (not needed yet), so this is null for them.
    url: isPublic ? publicUrl(bucketId, a.key) : null,
  };
}

// --- OpenAPI ----------------------------------------------------------------
const pParams = { org: "The organization slug." };

registerComponentSchema(
  "UploadConfig",
  z.object({
    enabled: z.boolean(),
    maxSizeBytes: z.number(),
    acceptedTypes: z.array(z.string()),
  }),
);
registerComponentSchema(
  "UploadTicket",
  z.object({
    assetId: z.string(),
    upload: z.object({
      url: z.string(),
      method: z.literal("PUT"),
      headers: z.record(z.string(), z.string()),
      expiresIn: z.number(),
    }),
    publicUrl: z.string(),
  }),
);
registerComponentSchema(
  "AssetResponse",
  z.object({
    asset: z.object({
      id: z.string(),
      purpose: z.string().nullable(),
      contentType: z.string(),
      size: z.number(),
      status: z.string(),
      url: z.string().nullable(),
    }),
  }),
);

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/uploads/config",
  summary: "Upload configuration",
  description:
    "Whether uploads are enabled on this deployment, plus the size and type limits. Lets a client render the upload UI present-but-disabled when storage is not configured.",
  tags: [TAG],
  auth: true,
  paramDescriptions: pParams,
  responses: { 200: { description: "Upload configuration.", schemaName: "UploadConfig" } },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/uploads",
  summary: "Request an upload",
  description:
    "Create a pending asset and return a presigned PUT the client uploads the bytes to directly. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: pParams,
  request: { body: presignBody },
  responses: {
    201: { description: "A presigned upload ticket.", schemaName: "UploadTicket" },
    413: { description: "The file is larger than the limit." },
    422: { description: "Unsupported type, or invalid request." },
    503: { description: "Uploads are not configured on this deployment." },
  },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/uploads/{id}/complete",
  summary: "Complete an upload",
  description:
    "Confirm the object was uploaded (verified by HEAD) and mark the asset ready. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { ...pParams, id: "The asset id from the upload ticket." },
  responses: {
    200: { description: "The ready asset.", schemaName: "AssetResponse" },
    400: { description: "The object was not found in storage." },
    404: { description: "No such pending asset." },
    503: { description: "Uploads are not configured on this deployment." },
  },
});

// --- Handlers ---------------------------------------------------------------

uploads_.get("/config", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  return c.json({
    enabled: isStorageConfigured(),
    maxSizeBytes: ORG_LOGO_MAX,
    acceptedTypes: ACCEPTED_TYPES,
  });
});

uploads_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  if (!isStorageConfigured())
    return jsonError(c, 503, "Uploads are not configured on this deployment.");

  const parsed = presignBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { purpose, contentType, size } = parsed.data;

  const spec = PURPOSES[purpose];
  if (size > spec.maxSizeBytes)
    return jsonError(c, 413, `That file is too large (max ${Math.round(spec.maxSizeBytes / 1024 / 1024)} MB).`);
  const ext = ACCEPTED[contentType]!;
  const bucketId = spec.bucket;
  const key = buildAssetKey({ orgId: ctx.orgId, purpose, ext });

  const asset = await withOrg(ctx.orgId, async (tx) => {
    const [row] = await tx
      .insert(assets)
      .values({
        organizationId: ctx.orgId,
        bucket: bucketId,
        key,
        visibility: getBucket(bucketId).visibility,
        contentType,
        sizeBytes: size,
        purpose,
        status: "pending",
        createdByUserId: ctx.actorUserId,
      })
      .returning();
    return row;
  });

  const upload = await presignPut({ bucket: bucketId, key, contentType });
  return c.json({ assetId: asset.id, upload, publicUrl: publicUrl(bucketId, key) }, 201);
});

uploads_.post("/:id/complete", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  if (!isStorageConfigured())
    return jsonError(c, 503, "Uploads are not configured on this deployment.");

  const id = c.req.param("id");
  const asset = await withOrg(ctx.orgId, (tx) =>
    tx.select().from(assets).where(eq(assets.id, id)).limit(1).then((r) => r[0] ?? null),
  );
  if (!asset) return jsonError(c, 404, "Upload not found.");

  if (asset.status !== "ready") {
    // Confirm the bytes actually landed before trusting the asset. HEAD is a
    // network call, so it runs outside the DB transaction.
    const head = await headObject({ bucket: asset.bucket as BucketId, key: asset.key });
    if (!head) return jsonError(c, 400, "The file wasn't uploaded. Please try again.");
    const [row] = await withOrg(ctx.orgId, (tx) =>
      tx
        .update(assets)
        .set({ status: "ready", sizeBytes: head.size || asset.sizeBytes, updatedAt: new Date() })
        .where(eq(assets.id, id))
        .returning(),
    );
    return c.json({ asset: serializeAsset(row) });
  }

  return c.json({ asset: serializeAsset(asset) });
});
