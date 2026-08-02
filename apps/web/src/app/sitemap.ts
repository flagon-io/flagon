import type { MetadataRoute } from "next";
import { brand } from "@flagon/design/brand";
import { flatNav } from "@/lib/docs-nav";

/**
 * One sitemap for the whole site: the marketing pages plus every docs page
 * (derived from the docs nav, so a page added there is indexed automatically).
 */
const MARKETING = ["/", "/pricing", "/privacy", "/security", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = [...new Set(["/docs", ...flatNav.map((i) => i.href)])];
  return [...MARKETING, ...docs].map((path) => ({
    url: new URL(path, brand.url).toString(),
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : path.startsWith("/docs") ? 0.7 : 0.8,
  }));
}
