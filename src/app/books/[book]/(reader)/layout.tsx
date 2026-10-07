import { notFound } from "next/navigation";
import { DocsShell } from "@/components/docs-shell";
import { BookSidebar } from "@/components/book-sidebar";
import { DepthControl } from "@/components/deep-dive";
import { getBook, getParts } from "@/lib/books";

/** Reading a book: the docs shell, with the book's parts and chapters as the nav. */
export default async function BookReaderLayout(props: LayoutProps<"/books/[book]">) {
  const { book: slug } = await props.params;
  const book = getBook(slug);
  if (!book) notFound();

  const nav = {
    slug: book.slug,
    title: book.title,
    parts: getParts(book).map((p) => ({
      name: p.name,
      chapters: p.chapters.map(({ slug, title, number }) => ({ slug, title, number })),
    })),
  };

  return (
    <DocsShell
      toggleLabel={`Browse ${book.title}`}
      sidebar={<BookSidebar book={nav} />}
      tools={<DepthControl />}
    >
      {props.children}
    </DocsShell>
  );
}
