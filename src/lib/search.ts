import "server-only";
import { getHandbookSections } from "@/lib/handbook";
import { getAllPosts } from "@/lib/blog";
import { chapterHref, chapterLabel, getBooks } from "@/lib/books";
import { PRODUCTS, productHref } from "@/lib/products";

/** One searchable entry in the site-wide command palette. */
export type SearchDoc = {
  title: string;
  url: string;
  group: "Pages" | "Handbook" | "Books" | "Blog";
  section?: string;
  description?: string;
};

/** Top-level pages, hand-curated so the palette can jump anywhere on the site. */
const PAGES: SearchDoc[] = [
  { title: "Home", url: "/", group: "Pages", description: "Flagon, Inc.: a small company that builds products in the open." },
  { title: "About", url: "/about", group: "Pages", description: "Who we are and why we do it this way." },
  { title: "Products", url: "/products", group: "Pages", description: "What we make, starting with g1t." },
  { title: "Handbook", url: "/handbook", group: "Pages", description: "How the whole company works, in the open." },
  { title: "Blog", url: "/blog", group: "Pages", description: "Notes from building in public." },
  { title: "Books", url: "/books", group: "Pages", description: "Free books, readable here or as a PDF." },
  { title: "Careers", url: "/careers", group: "Pages", description: "Work at the company we always wanted to work for." },
  { title: "Not for everyone", url: "/not-for-everyone", group: "Pages", description: "Honest reasons Flagon might be wrong for you." },
];

/** The full index: pages, every handbook page, every book chapter, and every blog post. */
export async function getSearchIndex(): Promise<SearchDoc[]> {
  const handbook: SearchDoc[] = (await getHandbookSections()).flatMap((s) =>
    s.pages.map((p) => ({
      title: p.title,
      url: `/handbook/${p.slug}`,
      group: "Handbook" as const,
      section: s.name,
      description: p.description,
    })),
  );

  const blog: SearchDoc[] = getAllPosts().map((p) => ({
    title: p.title,
    url: `/blog/${p.slug}`,
    group: "Blog" as const,
    description: p.description,
  }));

  const products: SearchDoc[] = PRODUCTS.map((p) => ({
    title: p.name,
    url: productHref(p),
    group: "Pages" as const,
    description: p.tagline,
  }));

  const books: SearchDoc[] = getBooks().flatMap((b) => [
    { title: b.title, url: `/books/${b.slug}`, group: "Books" as const, description: b.description },
    ...b.chapters.map((c) => ({
      title: c.title,
      url: chapterHref(b, c),
      group: "Books" as const,
      section: `${b.title} · ${chapterLabel(c)}`,
      description: c.description,
    })),
  ]);

  return [...PAGES, ...products, ...handbook, ...books, ...blog];
}
