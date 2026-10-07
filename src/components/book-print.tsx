import { isValidElement, type ComponentProps, type ReactNode } from "react";
import { Mdx } from "@/components/mdx";
import { BookCover } from "@/components/book-cover";
import { PART_ART } from "@/components/book-art";
import { formatDate } from "@/lib/blog";
import { chapterLabel, getParts, type Book, type Chapter } from "@/lib/books";
import { extractToc } from "@/lib/toc";
import { buildIndex, indexSortKey, type IndexEntry } from "@/lib/book-index";
import { site } from "@/lib/site";
import { slug } from "github-slugger";

/**
 * The whole book as one long page, for printing. Two editions share it:
 *
 *   screen  the downloadable PDF: cover, title page, contents, every chapter,
 *           in color, links clickable (/books/<book>/print).
 *   book    the print-on-demand interior, rendered in two halves that
 *           scripts/book-print.mjs prints and merges (/books/<book>/print/book):
 *           front matter numbered in roman, then the body from page 1, black
 *           and white, chapters opening on right-hand pages, running heads, and
 *           real page numbers in the contents and in cross-references.
 *
 * Every chapter is on the same page here, so heading ids are prefixed with the
 * chapter's slug (they'd collide otherwise: every chapter has "The short
 * version"). Headings nest the way the book does (title h1, part h2, chapter
 * h3, sections h4/h5) because Chrome builds the PDF's bookmarks from them, and
 * the print script reads page numbers back out of those bookmarks.
 */

export type PrintEdition =
  | { kind: "screen" }
  | {
      kind: "book";
      section: "front" | "body";
      /** Ids of part and chapter openers that need a blank page before them. */
      blanks: Set<string>;
      /** Page numbers from the previous pass, by heading id (body folios). */
      pages: Record<string, number>;
      /** Page geometry, in inches. */
      geometry: BookGeometry;
    };

export type BookGeometry = {
  width: number;
  height: number;
  top: number;
  bottom: number;
  /** Inside (gutter) and outside margins; they swap sides on facing pages. */
  inside: number;
  outside: number;
};

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const FRONT_PARTS = new Set(["Front matter"]);

export const partId = (n: number) => `part-${n}`;
/** The index opens like a chapter: same id scheme, so it lands on a right-hand page. */
const INDEX_ID = "ch-index";
export const chapterId = (slug: string) => `ch-${slug}`;

/** Heading ids and links for one chapter, rewritten for the single-page book. */
function printComponents(book: Book, chapterSlug: string, edition: PrintEdition) {
  const prefix = (id: string) => `${chapterSlug}--${id}`;
  const chapterSlugs = new Set(book.chapters.map((c) => c.slug));
  const bookPath = `/books/${book.slug}/`;
  const pages = edition.kind === "book" ? edition.pages : {};

  /** In-document target for a link, if it points inside this book. */
  function internal(href: string): string | null {
    if (href.startsWith("#")) return prefix(href.slice(1));
    if (href.startsWith(bookPath)) {
      const [target, hash] = href.slice(bookPath.length).split("#");
      if (chapterSlugs.has(target)) return hash ? `${target}--${hash}` : chapterId(target);
    }
    return null;
  }

  function Anchor({ href = "", children, ...props }: ComponentProps<"a">) {
    // A heading's link to itself is for the web; on paper it's just the title.
    if (typeof props.className === "string" && props.className.includes("heading-anchor")) {
      return <>{children}</>;
    }
    const target = internal(href);
    if (target) {
      const page = pages[target];
      return (
        <>
          <a href={`#${target}`} {...props}>
            {children}
          </a>
          {page ? <span className="print-pageref"> (p.&nbsp;{page})</span> : null}
        </>
      );
    }
    // Anything else on the site needs to be absolute to work from paper or PDF.
    const absolute = href.startsWith("/") ? `${site.url}${href}` : href;
    // On paper a URL in the middle of a sentence is noise, and every source is
    // listed in the bibliography. So the book edition prints URLs only there,
    // and for the book's own pages (the lab, the repo), which have nowhere else.
    const ours = absolute.startsWith(site.url) || absolute.startsWith(site.links.repo);
    const printUrl = edition.kind === "book" && (chapterSlug === "bibliography" || ours);
    return (
      <a href={absolute} {...props} data-url={printUrl ? displayUrl(absolute) : undefined}>
        {children}
      </a>
    );
  }

  return {
    // On paper every deep dive is printed, set apart so a reader can skip it.
    DeepDive: ({ title, children }: { title: string; children?: ReactNode }) => (
      // An h6 so the print script can find its page from the bookmarks, and
      // links to it can print "(p. N)" like any heading.
      <section className="print-deep-dive" id={prefix(slug(title))}>
        <p className="print-deep-dive-label">Deep dive</p>
        <h6 className="print-deep-dive-title">{title}</h6>
        {children}
      </section>
    ),
    // On paper there's nothing to unfold and no terminal at hand, so a box
    // prints what it proves: each check's claim, and the lab script holding it.
    ProveIt: ({ lab, children }: { lab?: string; children?: ReactNode }) => {
      const claims = proveClaims(textOf(children));
      const file = lab ? (lab.endsWith(".sh") ? lab : `${lab}.sql`) : null;
      if (!claims.length && !file) return null;
      return (
        <div className="print-prove">
          <p className="print-prove-head">
            Proved{file ? <> in {file}</> : null}
          </p>
          {claims.length ? (
            <ul>
              {claims.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    },
    a: Anchor,
    h2: ({ id, ...props }: ComponentProps<"h2">) => <h4 id={id ? prefix(id) : undefined} {...props} />,
    h3: ({ id, ...props }: ComponentProps<"h3">) => <h5 id={id ? prefix(id) : undefined} {...props} />,
  };
}

/** The visible text of rendered MDX children (code blocks included). */
function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/**
 * The claims a Prove it box checks: the first argument of every
 * lab.prove('...') in SQL, or prove '...' / prove "..." in a shell lab.
 */
function proveClaims(code: string): string[] {
  const claims: string[] = [];
  for (const m of code.matchAll(/\bprove\s*\(\s*'((?:[^']|'')*)'/g)) claims.push(m[1].replace(/''/g, "'"));
  for (const m of code.matchAll(/(?:^|\n)\s*prove\s+(?:'([^']*)'|"((?:[^"\\]|\\.)*)")/g)) {
    claims.push((m[1] ?? m[2]).replace(/\\(.)/g, "$1"));
  }
  return [...new Set(claims.map((c) => c.trim()).filter(Boolean))];
}

/** A URL as printed: no scheme, no trailing slash. */
function displayUrl(href: string): string {
  return href.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function ChapterArticle({
  book,
  chapter,
  edition,
}: {
  book: Book;
  chapter: Chapter;
  edition: PrintEdition;
}) {
  const id = chapterId(chapter.slug);
  const blank = edition.kind === "book" && edition.blanks.has(id);
  return (
    <>
      {blank ? <div className="print-blank" aria-hidden /> : null}
      <article
        id={id}
        className="print-chapter"
        style={edition.kind === "book" ? { page: namedPage(chapter.slug) } : undefined}
      >
        <header className="print-chapter-head">
          <h3>
            <span>{chapterLabel(chapter)}</span> {chapter.title}
          </h3>
          {chapter.description ? <p className="print-dek">{chapter.description}</p> : null}
        </header>
        <div className="prose">
          <Mdx source={chapter.content} overrides={printComponents(book, chapter.slug, edition)} />
        </div>
      </article>
    </>
  );
}

/** CSS named page for a chapter: carries its running heads. */
const namedPage = (slug: string) => `ch-${slug.replace(/[^a-z0-9-]/g, "")}`;

/**
 * Page rules for the print-on-demand edition, generated per book: geometry
 * from the script, mirrored margins, folios on the outside corners, and a
 * running head per chapter (book title on the left page, chapter title on the
 * right). Chrome can't read text into a running head, so each chapter gets a
 * named page of its own.
 */
function bookPageStyles(book: Book, g: BookGeometry, section: "front" | "body"): string {
  const folio = section === "front" ? "counter(page, lower-roman)" : "counter(page)";
  const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const head = `font-family: var(--font-geist-sans), sans-serif; font-size: 7.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #555;`;
  const foot = `font-family: var(--font-geist-sans), sans-serif; font-size: 8.5pt; color: #333;`;
  const rules = [
    `@page { size: ${g.width}in ${g.height}in; margin: ${g.top}in ${g.outside}in ${g.bottom}in ${g.inside}in; }`,
    `@page :left { margin-left: ${g.outside}in; margin-right: ${g.inside}in; @bottom-left { content: ${folio}; ${foot} } }`,
    `@page :right { margin-left: ${g.inside}in; margin-right: ${g.outside}in; @bottom-right { content: ${folio}; ${foot} } }`,
    // Blank pages and openers carry nothing at all.
    `@page blank { @bottom-left { content: none } @bottom-right { content: none } }`,
    `@page opener { @bottom-left { content: none } @bottom-right { content: none } }`,
  ];
  if (section === "body") {
    for (const c of book.chapters) {
      const n = namedPage(c.slug);
      rules.push(
        `@page ${n}:left { @top-left { content: ${quote(book.title)}; ${head} } }`,
        `@page ${n}:right { @top-right { content: ${quote(c.title)}; ${head} } }`,
      );
    }
    rules.push(
      `@page ${INDEX_ID}:left { @top-left { content: ${quote(book.title)}; ${head} } }`,
      `@page ${INDEX_ID}:right { @top-right { content: "Index"; ${head} } }`,
    );
  }
  return rules.join("\n");
}

export function PrintBook({ book, edition }: { book: Book; edition: PrintEdition }) {
  const parts = getParts(book);
  const year = book.published ? new Date(book.published).getUTCFullYear() : new Date().getFullYear();
  const isBook = edition.kind === "book";
  const showFront = !isBook || edition.section === "front";
  const showBody = !isBook || edition.section === "body";
  const pages = isBook ? edition.pages : {};
  const frontChapters = book.chapters.filter((c) => FRONT_PARTS.has(c.part));

  let partNo = 0;
  const body: ReactNode[] = [];
  for (const part of parts) {
    if (isBook && FRONT_PARTS.has(part.name)) continue; // front matter lives in the front half
    const numbered = part.chapters.some((c) => c.number != null);
    const roman = numbered ? ROMAN[partNo] : null;
    if (numbered) partNo++;
    const pid = partId(partNo);
    const PartArt = PART_ART[part.name];
    body.push(
      <div key={part.name}>
        {roman ? (
          <>
            {isBook && edition.blanks.has(pid) ? <div className="print-blank" aria-hidden /> : null}
            <section className="print-front print-part" id={pid}>
              <h2>
                <span>Part {roman}</span> {part.name}
              </h2>
              {PartArt ? <PartArt id={`${pid}-art`} /> : null}
            </section>
            {/* A part opener stands alone on its right-hand page; the next
                chapter starts on the following right-hand page. */}
            {isBook ? <div className="print-blank" aria-hidden /> : null}
          </>
        ) : null}
        {part.chapters.map((meta) => (
          <ChapterArticle
            key={meta.slug}
            book={book}
            chapter={book.chapters.find((c) => c.slug === meta.slug)!}
            edition={edition}
          />
        ))}
      </div>,
    );
  }

  const contents = (
    <nav className="print-front print-contents" aria-label="Contents">
      <h2>Contents</h2>
      {parts.map((part) => (
        <div key={part.name} className="print-contents-part">
          <p className="print-contents-partname">{part.name}</p>
          <ol>
            {part.chapters.map((c) => {
              const page = pages[chapterId(c.slug)];
              return (
                <li key={c.slug}>
                  <a href={`#${chapterId(c.slug)}`}>
                    <span className="print-contents-no">{c.number != null ? c.number : ""}</span>
                    <span className="print-contents-title">{c.title}</span>
                    {isBook ? (
                      <span className="print-contents-page">
                        {FRONT_PARTS.has(c.part) ? (pages[chapterId(c.slug)] ? toRoman(page) : "") : (page ?? "")}
                      </span>
                    ) : null}
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
      {isBook ? (
        <div className="print-contents-part">
          <ol>
            <li>
              <a href={`#${INDEX_ID}`}>
                <span className="print-contents-no" />
                <span className="print-contents-title">Index</span>
                <span className="print-contents-page">{pages[INDEX_ID] ?? ""}</span>
              </a>
            </li>
          </ol>
        </div>
      ) : null}
    </nav>
  );

  return (
    <>
      {/* Paper is white whatever the reader's theme: drop dark mode for this
          page before it paints. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";`,
        }}
      />
      {isBook ? <style>{bookPageStyles(book, edition.geometry, edition.section)}</style> : null}
      <main className={isBook ? "book-print book-edition" : "book-print"}>
        {!isBook ? (
          <section className="print-cover">
            <BookCover book={book} size="lg" className="h-full w-full rounded-none shadow-none" />
          </section>
        ) : null}

        {showFront && isBook ? (
          <>
            {/* Half title, then its blank back. */}
            <section className="print-front print-halftitle">
              <p>{book.title}</p>
            </section>
            <div className="print-blank" aria-hidden />
          </>
        ) : null}

        {showFront ? (
          <section className="print-front print-titlepage">
            <div>
              <h1>{book.title}</h1>
              <p className="print-subtitle">{book.subtitle}</p>
              <p className="print-byline">{book.author}</p>
            </div>
            {book.publisher ? <p className="print-publisher">{book.publisher}</p> : null}
          </section>
        ) : null}

        {showFront ? (
          <section className="print-front print-copyright">
            <p>
              {book.title}: {book.subtitle}
            </p>
            <p>
              Copyright © {year} {site.legalName}. All rights reserved. Written by {book.author}.
            </p>
            <p>
              The text is free to read online but may not be republished without permission. The
              lab scripts are released under the MIT License, so copy and adapt them freely.
            </p>
            <p>
              {book.edition}
              {book.published ? `, ${formatDate(book.published)}` : ""}.
            </p>
            {isBook && book.isbn ? <p>ISBN {book.isbn}</p> : null}
            <p>
              The whole book is free to read online at {site.domain}/books/{book.slug}, where every
              chapter&rsquo;s claims can be rerun with the book&rsquo;s lab ({site.domain}/books/
              {book.slug}/lab).
            </p>
            <p>
              Found a mistake? It&rsquo;s a bug: {site.links.repo.replace(/^https:\/\//, "")}
            </p>
            <p>
              PostgreSQL is a trademark of the PostgreSQL Community Association. Other product names
              are trademarks of their owners and are used here only to identify them.
            </p>
          </section>
        ) : null}

        {showFront ? contents : null}

        {/* In the book edition the preface belongs to the front matter. */}
        {isBook && edition.section === "front"
          ? frontChapters.map((c) => (
              <ChapterArticle key={c.slug} book={book} chapter={c} edition={edition} />
            ))
          : null}

        {showBody ? body : null}

        {isBook && edition.section === "body" ? (
          <PrintIndex entries={buildIndex(book)} pages={pages} blank={edition.blanks.has(INDEX_ID)} />
        ) : null}
      </main>
    </>
  );
}

/**
 * The back-of-book index, two columns, grouped by letter. Locators are page
 * numbers from the previous pass; the glossary's own section for a term is in
 * bold. On the first pass there are no pages yet, so placeholders keep the
 * index about the size it will finally be, and the passes settle quickly.
 */
function PrintIndex({
  entries,
  pages,
  blank,
}: {
  entries: IndexEntry[];
  pages: Record<string, number>;
  blank: boolean;
}) {
  const firstPass = Object.keys(pages).length === 0;
  const rows = entries
    .map((e) => {
      const byPage = new Map<number, boolean>();
      e.locators.forEach((l, i) => {
        const page = firstPass ? 100 + i : pages[l.id];
        if (page) byPage.set(page, (byPage.get(page) ?? false) || l.primary);
      });
      const locs = [...byPage.entries()].sort((a, b) => a[0] - b[0]);
      return { ...e, locs };
    })
    .filter((e) => e.locs.length || e.see);

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = indexSortKey(r.term).charAt(0);
    const letter = /[a-z]/.test(key) ? key.toUpperCase() : "#";
    groups.set(letter, [...(groups.get(letter) ?? []), r]);
  }

  return (
    <>
      {blank ? <div className="print-blank" aria-hidden /> : null}
      <section id={INDEX_ID} className="print-chapter print-index" style={{ page: INDEX_ID }}>
        <header className="print-chapter-head">
          <h3>Index</h3>
          <p className="print-dek">Page numbers in bold mark the section that teaches the term.</p>
        </header>
        <div className="print-index-cols">
          {[...groups.entries()].map(([letter, items]) => (
            <div key={letter} className="print-index-group">
              <p className="print-index-letter">{letter}</p>
              {items.map((r) => (
                <p key={r.term} className="print-index-entry">
                  {r.code ? <code>{r.term}</code> : r.term}
                  {r.locs.map(([page, primary]) => (
                    <span key={page}>
                      {", "}
                      {primary ? <strong>{page}</strong> : page}
                    </span>
                  ))}
                  {r.see ? (
                    <span className="print-index-see">
                      {r.locs.length ? "; see also " : ", see "}
                      {r.see}
                    </span>
                  ) : null}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function toRoman(n: number | undefined): string {
  if (!n) return "";
  const map: [number, string][] = [
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let out = "";
  let left = n;
  for (const [v, s] of map) {
    while (left >= v) {
      out += s;
      left -= v;
    }
  }
  return out;
}

/** Every heading id a chapter contributes, in order (for the print script). */
export function chapterHeadingIds(chapter: Chapter): string[] {
  return extractToc(chapter.content).map((t) => `${chapter.slug}--${t.id}`);
}
