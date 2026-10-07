import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentProps } from "react";
import { Mdx, ProveIt } from "@/components/mdx";
import { Toc } from "@/components/toc";
import { Pager } from "@/components/pager";
import { PdfDownload } from "@/components/pdf-download";
import { chapterHref, chapterLabel, getBook, getBooks, getParts } from "@/lib/books";
import { PART_ART } from "@/components/book-art";
import { site } from "@/lib/site";
import { extractToc } from "@/lib/toc";

export const dynamicParams = false;

export function generateStaticParams() {
  return getBooks().flatMap((b) =>
    b.chapters.map((c) => ({ book: b.slug, chapter: c.slug })),
  );
}

function load(bookSlug: string, chapterSlug: string) {
  const book = getBook(bookSlug);
  const idx = book ? book.chapters.findIndex((c) => c.slug === chapterSlug) : -1;
  if (!book || idx < 0) return null;
  return {
    book,
    chapter: book.chapters[idx],
    prev: idx > 0 ? book.chapters[idx - 1] : null,
    next: idx < book.chapters.length - 1 ? book.chapters[idx + 1] : null,
  };
}

export async function generateMetadata(
  props: PageProps<"/books/[book]/[chapter]">,
): Promise<Metadata> {
  const { book, chapter } = await props.params;
  const found = load(book, chapter);
  if (!found) return {};
  return {
    title: `${found.chapter.title} · ${found.book.title}`,
    description: found.chapter.description,
  };
}

export default async function ChapterPage(props: PageProps<"/books/[book]/[chapter]">) {
  const params = await props.params;
  const found = load(params.book, params.chapter);
  if (!found) notFound();
  const { book, chapter, prev, next } = found;

  const toc = extractToc(chapter.content);
  // Earlier chapters this one assumes, for readers who jumped straight here.
  const prereqs = chapter.buildsOn
    .map((s) => book.chapters.find((c) => c.slug === s))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const label = chapterLabel(chapter);
  // The first chapter of a numbered part opens with the part's drawing, as the
  // part's opener page does in print.
  const numberedParts = getParts(book).filter((p) => p.chapters.some((c) => c.number != null));
  const partIndex = numberedParts.findIndex((p) => p.chapters[0]?.slug === chapter.slug);
  const opensPart = partIndex >= 0 ? numberedParts[partIndex] : null;
  const PartArt = opensPart ? PART_ART[opensPart.name] : undefined;

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-12">
      <main className="min-w-0">
        <article>
          {opensPart && PartArt ? (
            <div className="mb-10 border-b border-hairline pb-10">
              <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
                Part {["I", "II", "III", "IV", "V", "VI", "VII", "VIII"][partIndex]} · {opensPart.name}
              </p>
              <PartArt id="part-art" className="mt-6 max-w-md" />
            </div>
          ) : null}
          <header className="border-b border-hairline pb-8">
            <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
              {label}
              {chapter.number != null && chapter.part ? ` · ${chapter.part}` : ""} ·{" "}
              {chapter.simpleMinutes} min read
              {chapter.readingMinutes > chapter.simpleMinutes
                ? ` · ${chapter.readingMinutes} with deep dives`
                : ""}
            </p>
            <h1 className="mt-4 text-balance text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl">
              {chapter.title}
            </h1>
            {chapter.description ? (
              <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
                {chapter.description}
              </p>
            ) : null}
            {prereqs.length > 0 ? (
              <p className="mt-5 text-sm leading-relaxed text-subtle">
                <span className="font-mono text-[11px] uppercase tracking-widest">Builds on</span>{" "}
                {prereqs.map((c, i) => (
                  <span key={c.slug}>
                    {i > 0 ? (i === prereqs.length - 1 ? " and " : ", ") : null}
                    <Link
                      href={chapterHref(book, c)}
                      className="text-muted-foreground underline decoration-hairline underline-offset-2 hover:text-foreground"
                    >
                      {c.title}
                    </Link>
                  </span>
                ))}
                . Skim {prereqs.length === 1 ? "it" : "them"} first if you jumped straight here.
              </p>
            ) : null}
          </header>

          <div className="prose mt-10 max-w-2xl">
            <Mdx
              source={chapter.content}
              overrides={{
                ProveIt: (p: ComponentProps<typeof ProveIt>) => <ProveIt {...p} book={book.slug} />,
              }}
            />
          </div>
        </article>

        <div className="mt-12 flex max-w-2xl flex-wrap items-center justify-between gap-4 border-t border-hairline pt-6">
          <a
            href={`${site.links.repo}/blob/main/${chapter.source}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-widest text-subtle transition hover:text-foreground"
          >
            Edit this chapter on GitHub →
          </a>
          {book.pdf ? (
            <a
              href={book.pdf.href}
              download
              className="font-mono text-[11px] uppercase tracking-widest text-subtle transition hover:text-foreground"
            >
              Download the whole book (PDF) ↓
            </a>
          ) : null}
        </div>

        <Pager
          prev={prev ? { href: chapterHref(book, prev), title: prev.title } : null}
          next={next ? { href: chapterHref(book, next), title: next.title } : null}
        />
      </main>

      {/* A scrolling rail clips anything past its box, and a slanted button's
          surface leans out past its own edges: pad the rail sideways (and pull
          it back with a negative margin) so the lean fits, and never scroll x. */}
      <aside className="hidden xl:-mx-3 xl:block xl:sticky xl:top-10 xl:max-h-[calc(100dvh-8rem)] xl:self-start xl:overflow-y-auto xl:overflow-x-hidden xl:overscroll-contain xl:px-3">
        <Toc items={toc} />
        {book.pdf ? (
          <div className="mt-8 border-t border-hairline pt-6">
            <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
              Take it with you
            </p>
            <PdfDownload pdf={book.pdf} title={book.title} variant="outline" className="mt-3" />
          </div>
        ) : null}
      </aside>
    </div>
  );
}
