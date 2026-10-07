import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintBook } from "@/components/book-print";
import { getBook, getBooks } from "@/lib/books";

/**
 * The screen edition of the whole book on one page: what the downloadable PDF
 * is printed from (scripts/book-pdf.mjs), and what a reader can print
 * themselves. The print-on-demand interior is a separate edition at
 * /books/<book>/print/book. Both render through components/book-print.tsx.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return getBooks().map((b) => ({ book: b.slug }));
}

export async function generateMetadata(props: PageProps<"/books/[book]/print">): Promise<Metadata> {
  const { book: slug } = await props.params;
  const book = getBook(slug);
  if (!book) return {};
  return {
    title: `${book.title} (print edition)`,
    description: book.description,
    // The same words as the chapter pages; let those be the ones that rank.
    robots: { index: false, follow: true },
  };
}

export default async function BookPrintPage(props: PageProps<"/books/[book]/print">) {
  const { book: slug } = await props.params;
  const book = getBook(slug);
  if (!book) notFound();
  return <PrintBook book={book} edition={{ kind: "screen" }} />;
}
