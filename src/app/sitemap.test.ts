import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";

/**
 * The sitemap is a hand-written list, and a hand-written list of the pages
 * that exist is a list that stops being true.
 *
 * This shipped wrong once: Products, Catalog, Feature Flags and four docs
 * pages were all added without their entries, so the entire new marketing
 * surface would have gone live unindexed with nothing failing. Nothing about
 * adding a page forces you to remember the sitemap, so the check has to come
 * from the filesystem instead of from discipline.
 */
const MARKETING = join(process.cwd(), "src", "app", "(marketing)");

/** Every route under (marketing) that renders a page, as a URL path. */
function marketingRoutes(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /^page\.(tsx|ts|mdx)$/.test(entry.name)) {
      found.push(prefix);
      continue;
    }
    if (!entry.isDirectory()) continue;
    // Route groups "(x)" add no path segment; dynamic segments "[x]" have no
    // single URL to list, so they are out of scope for a static sitemap.
    if (entry.name.startsWith("[")) continue;
    const segment = entry.name.startsWith("(") ? "" : `/${entry.name}`;
    found.push(...marketingRoutes(join(dir, entry.name), `${prefix}${segment}`));
  }
  return found;
}

describe("sitemap", () => {
  it("lists every public marketing page", () => {
    const listed = new Set(
      sitemap().map((entry) => new URL(entry.url).pathname.replace(/\/$/, "")),
    );
    const missing = marketingRoutes(MARKETING).filter(
      (route) => !listed.has(route),
    );

    expect(
      missing,
      `Add these to src/app/sitemap.ts: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("points every entry at the canonical host", () => {
    for (const entry of sitemap()) {
      expect(entry.url.startsWith("https://")).toBe(true);
    }
  });
});
