import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // Every public marketing page belongs here. `sitemap.test.ts` walks
  // src/app/(marketing) and fails if one is missing, because a page added
  // without its entry is invisible to search and nothing else notices.
  const routes: { path: string; priority: number }[] = [
    { path: "", priority: 1 },
    { path: "/products", priority: 0.9 },
    { path: "/products/catalog", priority: 0.8 },
    { path: "/products/feature-flags", priority: 0.8 },
    { path: "/pricing", priority: 0.9 },
    { path: "/enterprise", priority: 0.8 },
    { path: "/docs", priority: 0.8 },
    { path: "/docs/getting-started", priority: 0.8 },
    { path: "/docs/catalog", priority: 0.7 },
    { path: "/docs/feature-flags", priority: 0.7 },
    { path: "/docs/self-hosting", priority: 0.7 },
    { path: "/docs/authentication", priority: 0.7 },
    { path: "/docs/usage-analytics", priority: 0.7 },
    { path: "/docs/api", priority: 0.8 },
    { path: "/terms", priority: 0.5 },
    { path: "/privacy", priority: 0.5 },
    { path: "/security", priority: 0.5 },
  ];

  return routes.map(({ path, priority }) => ({
    url: `${brand.url}${path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority,
  }));
}
