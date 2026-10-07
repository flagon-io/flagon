import type { Metadata } from "next";
import Link from "next/link";
import { Frame } from "@/components/frame";
import { Section, SectionHeader } from "@/components/section";
import { BookStage } from "@/components/book-stage";
import { bookHref, getBooks } from "@/lib/books";

export const metadata: Metadata = {
  title: "Books",
  description:
    "Free books from Flagon: long-form, practical, and written in the open. Read them on the site or download the PDF.",
};

export default function BooksIndex() {
  const books = getBooks();

  return (
    <Frame>
      <main>
        <Section divider={false}>
          <SectionHeader
            title="Free books"
            lead="Long-form writing on the things we know well, given away. Read them here, chapter by chapter, or download the PDF and take them with you. No email gate, no upsell at the end."
          />
        </Section>

        <Section divider>
          <ul className="grid gap-x-4 gap-y-12 px-6 sm:px-8 md:grid-cols-2">
            {books.map((book) => (
              <li key={book.slug}>
                <Link
                  href={bookHref(book)}
                  className="art-host group flex h-full flex-col rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                >
                  <BookStage book={book} />
                  <div className="flex flex-1 flex-col pt-5">
                    <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-widest text-subtle">
                      <span>{book.chapters.length} chapters</span>
                      <span aria-hidden>·</span>
                      <span>{Math.round(book.readingMinutes / 60)} hours</span>
                      {book.pdf ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>PDF</span>
                        </>
                      ) : null}
                    </div>
                    <h2 className="mt-3 text-balance text-xl font-semibold tracking-tight group-hover:text-brand">
                      {book.title}
                    </h2>
                    <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                      {book.description}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </main>
    </Frame>
  );
}
