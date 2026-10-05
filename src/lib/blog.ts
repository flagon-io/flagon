import "server-only";
import { readCollection, readDoc } from "@/lib/content";
import { SCENES, type SceneName } from "@/components/art/scenes";

export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  role?: string;
  tags: string[];
  /** The cover drawing: `art:` in frontmatter, or one picked from the slug. */
  art: SceneName;
  readingMinutes: number;
  content: string;
};

/** Drawings a post can get by default; product scenes are opt-in by name. */
const DEFAULT_COVERS: SceneName[] = ["handbook", "open", "pricing", "teams", "craft", "panels", "stairs"];

/** The named cover if it exists, else a stable pick from the slug. */
function coverFor(slug: string, named: unknown): SceneName {
  if (typeof named === "string" && named in SCENES) return named as SceneName;
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DEFAULT_COVERS[h % DEFAULT_COVERS.length];
}

function toPost(d: {
  slug: string;
  content: string;
  data: Record<string, unknown>;
  readingMinutes: number;
}): Post {
  return {
    slug: d.slug,
    title: String(d.data.title ?? d.slug),
    description: String(d.data.description ?? ""),
    date: String(d.data.date ?? ""),
    author: String(d.data.author ?? "Flagon"),
    role: d.data.role ? String(d.data.role) : undefined,
    tags: Array.isArray(d.data.tags) ? (d.data.tags as string[]) : [],
    art: coverFor(d.slug, d.data.art),
    readingMinutes: d.readingMinutes,
    content: d.content,
  };
}

/** All posts, newest first. */
export function getAllPosts(): Post[] {
  return readCollection("blog")
    .map(toPost)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): Post | null {
  const d = readDoc("blog", slug);
  return d ? toPost(d) : null;
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Frontmatter dates are calendar days, parsed as UTC midnight; format them in
  // UTC too, or every timezone west of Greenwich shows the day before.
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
