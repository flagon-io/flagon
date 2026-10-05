import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { listHandbookSlugs } from "@/lib/handbook";
import { getAllPosts } from "@/lib/blog";
import { PRODUCTS, productHref } from "@/lib/products";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = site.url;
  const now = new Date();

  const staticRoutes = [
    "",
    "/about",
    "/handbook",
    "/blog",
    "/careers",
    "/products",
    "/not-for-everyone",
    "/media",
    "/people",
    "/side-projects",
    "/partnerships",
    "/teams",
  ].map((p) => ({
    url: `${base}${p}`,
    lastModified: now,
  }));

  const handbook = (await listHandbookSlugs()).map((slug) => ({
    url: `${base}/handbook/${slug}`,
    lastModified: now,
  }));

  const blog = getAllPosts().map((p) => ({
    url: `${base}/blog/${p.slug}`,
    lastModified: p.date ? new Date(p.date) : now,
  }));

  const products = PRODUCTS.map((p) => ({
    url: `${base}${productHref(p)}`,
    lastModified: now,
  }));

  return [...staticRoutes, ...products, ...handbook, ...blog];
}
