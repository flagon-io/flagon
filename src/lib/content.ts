import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { readingMinutes } from "@/lib/reading";

/** Root directory holding all long-form content collections. */
const CONTENT_ROOT = path.join(process.cwd(), "content");

export type RawDoc = {
  slug: string;
  content: string;
  data: Record<string, unknown>;
  readingMinutes: number;
};

function collectionDir(collection: string) {
  return path.join(CONTENT_ROOT, collection);
}

/** List the slugs (filenames without .mdx) in a collection. */
export function listSlugs(collection: string): string[] {
  const dir = collectionDir(collection);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

/** Read + parse a single document; returns null if it does not exist. */
export function readDoc(collection: string, slug: string): RawDoc | null {
  const file = path.join(collectionDir(collection), `${slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  const { content, data } = matter(raw);
  return {
    slug,
    content,
    data,
    readingMinutes: readingMinutes(content),
  };
}

/** Read every document in a collection. */
export function readCollection(collection: string): RawDoc[] {
  return listSlugs(collection)
    .map((slug) => readDoc(collection, slug))
    .filter((d): d is RawDoc => d !== null);
}
