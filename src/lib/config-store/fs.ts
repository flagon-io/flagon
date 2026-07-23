import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  configObjectKey,
  type ConfigStore,
  type StoreHead,
  type StoreObject,
} from "./types";

/** ETag from size + mtime: cheap for `head` (a stat, no read) and stable per write. */
function statEtag(size: number, mtimeMs: number): string {
  return `"${size.toString(16)}-${Math.round(mtimeMs).toString(16)}"`;
}

/**
 * Local-filesystem ConfigStore. The zero-dependency fallback for
 * self-hosters not running an object store, and the default for local
 * development outside Docker. Not suitable for multi-instance serverless
 * (each instance has its own disk) - configure S3/R2 there.
 */
export function createFsConfigStore(root: string): ConfigStore {
  const pathFor = (orgId: string) => join(root, configObjectKey("", orgId));

  async function head(orgId: string, etag: string | null): Promise<StoreHead> {
    try {
      const info = await stat(pathFor(orgId));
      const current = statEtag(info.size, info.mtimeMs);
      return etag && etag === current
        ? { status: "not-modified", etag: current }
        : { status: "modified", etag: current };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { status: "absent" };
      throw error;
    }
  }

  return {
    name: `fs(${root})`,

    head,

    async read(orgId, etag): Promise<StoreObject> {
      const target = pathFor(orgId);
      let current: string;
      try {
        const info = await stat(target);
        current = statEtag(info.size, info.mtimeMs);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return { status: "absent" };
        throw error;
      }
      if (etag && etag === current) return { status: "not-modified", etag: current };
      const body = await readFile(target, "utf8");
      return { status: "modified", etag: current, body };
    },

    async write(orgId, body): Promise<string> {
      const target = pathFor(orgId);
      await mkdir(dirname(target), { recursive: true });
      // Write to a temp file then rename: a concurrent reader sees either the
      // old file or the whole new one, never a half-written artifact.
      const tmp = `${target}.${process.pid}.tmp`;
      await writeFile(tmp, body, "utf8");
      await rename(tmp, target);
      const info = await stat(target);
      return statEtag(info.size, info.mtimeMs);
    },
  };
}
