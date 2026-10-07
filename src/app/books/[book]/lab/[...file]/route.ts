import { getBooks } from "@/lib/books";
import { labFile, labFiles } from "@/lib/book-lab";

/** One lab file as plain text, so a chapter can link the exact script. */
export function generateStaticParams() {
  return getBooks().flatMap((b) =>
    labFiles(b.slug).map((f) => ({ book: b.slug, file: f.path.split("/") })),
  );
}

export const dynamicParams = false;

export async function GET(_req: Request, ctx: RouteContext<"/books/[book]/lab/[...file]">) {
  const { book, file } = await ctx.params;
  const found = labFile(book, file.join("/"));
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(found.bytes), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
