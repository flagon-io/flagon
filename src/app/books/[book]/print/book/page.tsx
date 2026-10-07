import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintBook, type BookGeometry } from "@/components/book-print";
import { getBook } from "@/lib/books";

/**
 * The print-on-demand interior, rendered one half at a time for
 * scripts/book-print.mjs: `?state=<name>` names a JSON file the script wrote
 * to .book-print/<name>.json with the section (front or body), the page
 * geometry, which openers need a blank page before them, and the page numbers
 * from its previous pass. That's far too much to fit in a URL, and a file
 * keeps the passes reproducible. Not linked from anywhere, and not indexed.
 */

export const metadata: Metadata = { robots: { index: false, follow: false } };

type State = {
  section: "front" | "body";
  geometry: BookGeometry;
  blanks: string[];
  pages: Record<string, number>;
};

const DEFAULT_STATE: State = {
  section: "body",
  geometry: { width: 7, height: 10, top: 0.75, bottom: 0.8, inside: 0.875, outside: 0.6 },
  blanks: [],
  pages: {},
};

function readState(name: string | undefined): State {
  if (!name || !/^[a-z0-9-]+$/.test(name)) return DEFAULT_STATE;
  const file = path.join(process.cwd(), ".book-print", `${name}.json`);
  if (!fs.existsSync(file)) return DEFAULT_STATE;
  return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(file, "utf8")) };
}

export default async function BookEditionPage(props: PageProps<"/books/[book]/print/book">) {
  const { book: slug } = await props.params;
  const book = getBook(slug);
  if (!book) notFound();
  const query = await props.searchParams;
  const state = readState(typeof query.state === "string" ? query.state : undefined);

  return (
    <PrintBook
      book={book}
      edition={{
        kind: "book",
        section: state.section,
        geometry: state.geometry,
        blanks: new Set(state.blanks),
        pages: state.pages,
      }}
    />
  );
}
