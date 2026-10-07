import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { readingMinutes } from "@/lib/reading";

/**
 * Free books, written in the open like the handbook. Each book is a folder:
 *
 *   content/books/<book>/index.mdx      the book itself: frontmatter + an "about" body
 *   content/books/<book>/NN-<slug>.mdx  one file per chapter
 *
 * Reading order comes from `chapters:` (a list of slugs) in index.mdx when it's
 * there, so a chapter can be added or moved without renaming files; chapters it
 * doesn't list follow in file-name order. Without the list, file names decide.
 *
 * Chapter URLs drop the number (/books/<book>/<slug>), so a chapter can move
 * without breaking links. Chapters whose part is front or back matter (the
 * preface, the glossary) read in order but go unnumbered; the rest are numbered
 * by position, so the sidebar, the contents and the PDF always agree.
 *
 * The PDF is printed from /books/<book>/print by scripts/book-pdf.mjs as the
 * last step of `npm run build`, into public/books/<book>.pdf.
 */

const BOOKS_ROOT = path.join(process.cwd(), "content", "books");
const PUBLIC_ROOT = path.join(process.cwd(), "public");

/** Parts that hold chapters without a chapter number. */
const UNNUMBERED_PARTS = new Set(["Front matter", "Back matter"]);

export type ChapterMeta = {
  slug: string;
  title: string;
  description: string;
  part: string;
  /** Chapter number, or null for front and back matter. */
  number: number | null;
  /** Slugs of earlier chapters this one assumes (`builds_on:` in frontmatter). */
  buildsOn: string[];
  /** Minutes to read the prose, code excluded (see lib/reading.ts). */
  readingMinutes: number;
  /** Reading time of the essay track alone, without the deep dives. */
  simpleMinutes: number;
};

export type Chapter = ChapterMeta & {
  content: string;
  /** Source path relative to the repo root, for "edit on GitHub" links. */
  source: string;
};

export type Book = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  author: string;
  /** Who publishes it, e.g. Flagon; shown on the cover and title page. */
  publisher: string;
  edition: string;
  /** The print edition's back-cover copy (`back_cover:` in frontmatter). */
  backCover: string;
  /** ISBN for the print edition, once one is assigned (`isbn:` in frontmatter). */
  isbn: string;
  /** The paperback's store listing, once it's on sale (`amazon:` in frontmatter). */
  amazon: string;
  /** Cover drawing name (see components/book-cover.tsx). */
  cover: string;
  /** ISO date the current edition was published. */
  published: string;
  /** The "about this book" body shown on the book's landing page. */
  about: string;
  chapters: Chapter[];
  readingMinutes: number;
  /** Public URL of the PDF, or null when there isn't one to link. */
  pdf: { href: string } | null;
};

export type BookPart = { name: string; chapters: ChapterMeta[] };

function readBook(slug: string): Book | null {
  const dir = path.join(BOOKS_ROOT, slug);
  const indexFile = path.join(dir, "index.mdx");
  if (!fs.existsSync(indexFile)) return null;
  const { content: about, data } = matter(fs.readFileSync(indexFile, "utf8"));

  const order: string[] = Array.isArray(data.chapters) ? data.chapters.map(String) : [];
  const rank = (file: string) => {
    const at = order.indexOf(file.replace(/^\d+-/, "").replace(/\.mdx$/, ""));
    return at < 0 ? order.length : at;
  };

  let n = 0;
  const chapters: Chapter[] = fs
    .readdirSync(dir)
    .filter((f) => /^\d+-.+\.mdx$/.test(f))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((file) => {
      const { content, data: fm } = matter(fs.readFileSync(path.join(dir, file), "utf8"));
      const part = String(fm.part ?? "");
      const numbered = !UNNUMBERED_PARTS.has(part);
      return {
        slug: file.replace(/^\d+-/, "").replace(/\.mdx$/, ""),
        title: String(fm.title ?? file),
        description: String(fm.description ?? ""),
        part,
        number: numbered ? ++n : null,
        buildsOn: Array.isArray(fm.builds_on) ? fm.builds_on.map(String) : [],
        readingMinutes: readingMinutes(content),
        simpleMinutes: readingMinutes(content.replace(/<DeepDive[ >][\s\S]*?<\/DeepDive>/g, "")),
        content,
        source: ["content", "books", slug, file].join("/"),
      };
    });

  // Production builds render these pages before the PDF exists (it's printed
  // from the built site afterwards, and the build fails without it), so they
  // always link it. In development, link it only once you've built one.
  const pdfFile = path.join(PUBLIC_ROOT, "books", `${slug}.pdf`);
  const pdf =
    process.env.NODE_ENV === "production" || fs.existsSync(pdfFile)
      ? { href: `/books/${slug}.pdf` }
      : null;

  return {
    slug,
    title: String(data.title ?? slug),
    subtitle: String(data.subtitle ?? ""),
    description: String(data.description ?? ""),
    author: String(data.author ?? ""),
    publisher: String(data.publisher ?? ""),
    edition: String(data.edition ?? ""),
    cover: String(data.cover ?? ""),
    isbn: String(data.isbn ?? ""),
    amazon: String(data.amazon ?? ""),
    backCover: String(data.back_cover ?? ""),
    published: String(data.published ?? ""),
    about,
    chapters,
    readingMinutes: chapters.reduce((sum, c) => sum + c.readingMinutes, 0),
    pdf,
  };
}

/**
 * What the parsed books depend on: every book folder's files and their
 * modification times. Statting a few dozen files is cheap; parsing a whole
 * book (and timing its reading) on every call is not.
 */
function contentStamp(slugs: string[]): string {
  return slugs
    .flatMap((slug) => {
      const dir = path.join(BOOKS_ROOT, slug);
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"));
      const pdf = path.join(PUBLIC_ROOT, "books", `${slug}.pdf`);
      return [
        ...files.map((f) => `${slug}/${f}:${fs.statSync(path.join(dir, f)).mtimeMs}`),
        `${slug}.pdf:${fs.existsSync(pdf) ? fs.statSync(pdf).mtimeMs : 0}`,
      ];
    })
    .join("|");
}

/**
 * Every book, parsed once per process in production. Books are static content
 * shipped with the site, so there is nothing to invalidate between requests.
 * In development a page calls this several times per render, so the parse is
 * reused until a chapter file changes, and edits still show up on refresh.
 */
let cache: Book[] | null = null;
let cacheStamp = "";
export function getBooks(): Book[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const slugs = fs.existsSync(BOOKS_ROOT)
    ? fs
        .readdirSync(BOOKS_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];
  const stamp = process.env.NODE_ENV === "production" ? "" : contentStamp(slugs);
  if (cache && stamp === cacheStamp) return cache;
  cacheStamp = stamp;
  cache = slugs
    .map(readBook)
    .filter((b): b is Book => b !== null)
    .sort((a, b) => b.published.localeCompare(a.published));
  return cache;
}

export function getBook(slug: string): Book | null {
  return getBooks().find((b) => b.slug === slug) ?? null;
}

/** A chapter's metadata, without its body (safe to hand to client components). */
export function chapterMeta(c: Chapter): ChapterMeta {
  const { slug, title, description, part, number, buildsOn, readingMinutes, simpleMinutes } = c;
  return { slug, title, description, part, number, buildsOn, readingMinutes, simpleMinutes };
}

/** Chapters grouped into their parts, in reading order. */
export function getParts(book: Book): BookPart[] {
  const parts: BookPart[] = [];
  for (const c of book.chapters) {
    const last = parts[parts.length - 1];
    if (last && last.name === c.part) last.chapters.push(chapterMeta(c));
    else parts.push({ name: c.part, chapters: [chapterMeta(c)] });
  }
  return parts;
}

/** "Chapter 7" for numbered chapters, the part name for front/back matter. */
export function chapterLabel(c: ChapterMeta): string {
  return c.number != null ? `Chapter ${c.number}` : c.part;
}

export function bookHref(book: { slug: string }): string {
  return `/books/${book.slug}`;
}

export function chapterHref(book: { slug: string }, chapter: { slug: string }): string {
  return `/books/${book.slug}/${chapter.slug}`;
}
