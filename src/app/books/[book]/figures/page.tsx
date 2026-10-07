import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Frame } from "@/components/frame";
import { GUTTER } from "@/components/section";
import { FIGURES, PART_ART } from "@/components/book-art";
import { getBook, getBooks } from "@/lib/books";
import { cn } from "@/lib/cn";

/**
 * Every figure and part drawing in the book on one page, for reviewing the art
 * as a set. `?print=1` shows them in the print edition's grays.
 */

export const metadata: Metadata = { title: "Figures", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return getBooks().map((b) => ({ book: b.slug }));
}

export default async function FiguresPage(props: PageProps<"/books/[book]/figures">) {
  const { book: slug } = await props.params;
  const book = getBook(slug);
  if (!book) notFound();
  const print = (await props.searchParams).print === "1";

  return (
    <Frame>
      <main className={cn(GUTTER, "py-12")}>
        <div className={print ? "book-edition-preview bg-white p-8 text-black" : undefined}>
          <h1 className="text-3xl font-semibold tracking-tight">{book.title}: figures</h1>
          <h2 className="mt-12 font-mono text-[11px] uppercase tracking-widest text-subtle">Part openers</h2>
          <div className="mt-6 grid gap-12">
            {Object.entries(PART_ART).map(([part, Art]) => (
              <section key={part} className="max-w-2xl">
                <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">{part}</p>
                <Art id={`gallery-part-${part.replace(/\W+/g, "-")}`} />
              </section>
            ))}
          </div>
          <h2 className="mt-16 font-mono text-[11px] uppercase tracking-widest text-subtle">Figures</h2>
          <div className="mt-6 grid gap-12">
            {Object.entries(FIGURES).map(([name, Drawing]) => (
              <section key={name} className="max-w-2xl" id={name}>
                <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">{name}</p>
                <Drawing id={`gallery-${name}`} caption={<p>Caption goes here.</p>} />
              </section>
            ))}
          </div>
        </div>
      </main>
    </Frame>
  );
}
