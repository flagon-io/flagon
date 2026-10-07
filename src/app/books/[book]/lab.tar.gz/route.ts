import { getBooks } from "@/lib/books";
import { labFiles, labTarball } from "@/lib/book-lab";

/** The whole lab as one download: curl -L .../lab.tar.gz | tar xz */
export function generateStaticParams() {
  return getBooks()
    .filter((b) => labFiles(b.slug).length > 0)
    .map((b) => ({ book: b.slug }));
}

export const dynamicParams = false;

export async function GET(_req: Request, ctx: RouteContext<"/books/[book]/lab.tar.gz">) {
  const { book } = await ctx.params;
  return new Response(new Uint8Array(labTarball(book)), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${book}-lab.tar.gz"`,
    },
  });
}
