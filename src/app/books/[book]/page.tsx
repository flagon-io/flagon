import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { Section, GUTTER } from "@/components/section";
import { Cta } from "@/components/cta";
import { Mdx } from "@/components/mdx";
import { BookStage } from "@/components/book-stage";
import { PdfDownload } from "@/components/pdf-download";
import { PaperbackLink } from "@/components/paperback-link";
import { formatDate } from "@/lib/blog";
import { labFiles } from "@/lib/book-lab";
import { site } from "@/lib/site";
import {
  chapterHref,
  getBook,
  getBooks,
  getParts,
} from "@/lib/books";

export const dynamicParams = false;

export function generateStaticParams() {
  return getBooks().map((b) => ({ book: b.slug }));
}

export async function generateMetadata(props: PageProps<"/books/[book]">): Promise<Metadata> {
  const { book: slug } = await props.params;
  const book = getBook(slug);
  if (!book) return {};
  return {
    title: `${book.title}: a free book by ${book.author}`,
    description: book.description,
    authors: book.author ? [{ name: book.author }] : undefined,
    openGraph: {
      type: "book",
      title: `${book.title}: ${book.subtitle}`,
      description: book.description,
      authors: book.author ? [book.author] : undefined,
      releaseDate: book.published || undefined,
    },
  };
}

export default async function BookPage(props: PageProps<"/books/[book]">) {
  const { book: slug } = await props.params;
  const book = getBook(slug);
  if (!book) notFound();

  const parts = getParts(book);
  const first = book.chapters[0];
  const hours = Math.round(book.readingMinutes / 60);
  const hasLab = labFiles(book.slug).length > 0;

  // Structured data, so search engines credit the author, not the site.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    alternativeHeadline: book.subtitle || undefined,
    description: book.description,
    author: book.author ? { "@type": "Person", name: book.author } : undefined,
    publisher: book.publisher
      ? { "@type": "Organization", name: book.publisher, url: site.url }
      : undefined,
    datePublished: book.published || undefined,
    bookEdition: book.edition || undefined,
    inLanguage: "en",
    isAccessibleForFree: true,
    url: `${site.url}/books/${book.slug}`,
  };

  return (
    <Frame>
      <script
        type="application/ld+json"
        // JSON.stringify output can't close the script tag except via "</";
        // escaping "<" keeps any content-supplied text from breaking out.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <main>
        <section className="grid items-center gap-10 py-12 sm:py-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className={GUTTER}>
            <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
              A free book{book.edition ? ` · ${book.edition}` : ""}
            </p>
            <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              {book.title}
            </h1>
            {book.subtitle ? (
              <p className="mt-3 text-balance text-xl font-medium tracking-tight sm:text-2xl">
                {book.subtitle}
              </p>
            ) : null}
            {/* The author's name, the way a book jacket carries it; the
                publisher is a quieter credit in the details below. */}
            {book.author ? (
              <p className="mt-4 text-lg text-muted-foreground">
                by <span className="font-semibold text-foreground">{book.author}</span>
              </p>
            ) : null}
            <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              {book.description}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {first ? <Cta href={chapterHref(book, first)}>Start reading</Cta> : null}
              {book.pdf ? <PdfDownload pdf={book.pdf} title={book.title} /> : null}
              <PaperbackLink href={book.amazon} />
            </div>
            <dl className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-widest text-subtle">
              <div className="flex gap-1.5">
                <dt className="sr-only">Chapters</dt>
                <dd>{book.chapters.length} chapters</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="sr-only">Reading time</dt>
                <dd>About {hours} hours</dd>
              </div>
              {book.published ? (
                <div className="flex gap-1.5">
                  <dt className="sr-only">Published</dt>
                  <dd>{formatDate(book.published)}</dd>
                </div>
              ) : null}
              {book.publisher ? (
                <div className="flex gap-1.5">
                  <dt className="sr-only">Publisher</dt>
                  <dd>Published by {book.publisher}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <div className="px-6 sm:px-8 md:pl-0">
            <BookStage book={book} />
          </div>
        </section>

        <Section divider>
          <div className={GUTTER}>
            <div className="prose max-w-2xl">
              <Mdx source={book.about} />
            </div>
          </div>
        </Section>

        {hasLab ? (
          <Section divider>
            <div className={`${GUTTER} flex flex-col gap-6 md:flex-row md:items-end md:justify-between`}>
              <div className="max-w-2xl">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Don&rsquo;t take our word for it
                </h2>
                <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
                  Every claim in this book is backed by a check you can run. One compose file
                  gives you the same PostgreSQL 18 server and data we used, and each chapter has
                  a lab script that proves its numbers on your machine, or fails loudly if they
                  don&rsquo;t hold.
                </p>
              </div>
              <Cta href={`/books/${book.slug}/lab`} variant="secondary" className="shrink-0">
                Get the lab
              </Cta>
            </div>
          </Section>
        ) : null}

        <Section divider>
          <div className={GUTTER}>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Contents</h2>
            <div className="mt-10 flex flex-col gap-12">
              {parts.map((part, i) => (
                <section key={part.name} aria-labelledby={`part-${i}`}>
                  <h3
                    id={`part-${i}`}
                    className="font-mono text-[11px] uppercase tracking-widest text-subtle"
                  >
                    {part.name}
                  </h3>
                  <ol className="mt-4 border-t border-hairline">
                    {part.chapters.map((c) => (
                      <li key={c.slug}>
                        <Link
                          href={chapterHref(book, c)}
                          className="group grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 border-b border-hairline py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:grid-cols-[3rem_minmax(0,1fr)_auto]"
                        >
                          <span className="pt-0.5 font-mono text-xs tabular-nums text-subtle group-hover:text-brand">
                            {c.number != null ? String(c.number).padStart(2, "0") : ""}
                          </span>
                          <span>
                            <span className="block text-base font-semibold tracking-tight group-hover:text-brand">
                              {c.title}
                            </span>
                            {c.description ? (
                              <span className="mt-1.5 block max-w-2xl text-sm leading-relaxed text-muted-foreground">
                                {c.description}
                              </span>
                            ) : null}
                          </span>
                          <span className="col-start-2 mt-2 font-mono text-[11px] uppercase tracking-widest text-subtle sm:col-start-3 sm:mt-0 sm:pt-1">
                            {c.readingMinutes} min
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </div>
        </Section>
      </main>
    </Frame>
  );
}
