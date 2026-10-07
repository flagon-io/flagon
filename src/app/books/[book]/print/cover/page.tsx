import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookCover } from "@/components/book-cover";
import { getBook, getParts } from "@/lib/books";
import { site } from "@/lib/site";

/**
 * The printed book's full-wrap cover: back, spine, and front on one sheet,
 * with bleed, laid out to KDP's measurements. scripts/book-cover.mjs prints it
 * with the spine width worked out from the interior's real page count.
 *
 *   ?spine=2.148              spine width, in inches (required)
 *   &trim=7x10                trim size
 *   &bleed=0.125              paperback bleed; for a hardcover pass the
 *   &wrap=0.51&hinge=0.4      calculator's wrap and hinge instead
 *
 * Keep-clear zones follow KDP: text 0.125 in inside the trim (0.635 in on a
 * hardcover wrap), spine text 0.0625 in from the spine's edges and only when
 * the book has 79 or more pages, and a 2 x 1.2 in barcode area at least
 * 0.25 in from the trim and the spine on the back.
 */

export const metadata: Metadata = { robots: { index: false, follow: false } };

const num = (v: string | string[] | undefined, fallback: number) => {
  const n = Number(typeof v === "string" ? v : NaN);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export default async function CoverWrapPage(props: PageProps<"/books/[book]/print/cover">) {
  const { book: slug } = await props.params;
  const book = getBook(slug);
  if (!book) notFound();
  const q = await props.searchParams;

  const [trimW, trimH] = (typeof q.trim === "string" ? q.trim : "7x10").split("x").map(Number);
  const spine = num(q.spine, 1);
  const hardcover = typeof q.wrap === "string";
  const edge = hardcover ? num(q.wrap, 0.51) : num(q.bleed, 0.125); // paper past the trim
  const hinge = hardcover ? num(q.hinge, 0.4) : 0;
  const safe = hardcover ? 0.635 : 0.125; // keep text this far inside the trim
  const spineText = num(q.pages, 999) >= 79 && spine >= 0.3;

  const width = edge * 2 + trimW * 2 + hinge * 2 + spine;
  const height = edge * 2 + trimH;
  const panel = { width: `${trimW}in`, height: `${trimH}in` };
  // The book's parts, for the back cover's "inside" list (front/back matter excluded).
  const partNames = getParts(book)
    .map((p) => p.name)
    .filter((n) => n !== "Front matter" && n !== "Back matter");
  const paragraphs = book.backCover.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const inch = (n: number) => `${n}in`;

  return (
    <>
      <style>{`
        @page { size: ${width}in ${height}in; margin: 0; }
        html, body { margin: 0; background: #0a1f1d; }
      `}</style>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.classList.remove("dark");`,
        }}
      />
      <div
        className="relative overflow-hidden bg-[#0a1f1d] text-[#e9fbf7]"
        style={{ width: inch(width), height: inch(height) }}
      >
        {/* Back cover */}
        <section
          className="absolute flex flex-col"
          style={{
            left: inch(edge),
            top: inch(edge),
            ...panel,
            padding: `${inch(safe + 0.55)} ${inch(0.7)} ${inch(safe + 0.3)} ${inch(safe + 0.55)}`,
          }}
        >
          <p className="font-mono text-[9pt] uppercase tracking-[0.22em] text-[#5eead4]">
            {book.title}
          </p>
          <div className="mt-[0.35in] flex flex-col gap-[0.16in] text-[12pt] leading-[1.5] text-[#cfe9e3]">
            {paragraphs.map((p, i) => (
              <p key={i} className={i === 0 ? "font-heading text-[17pt] font-bold leading-[1.25] text-[#e9fbf7]" : ""}>
                {p}
              </p>
            ))}
          </div>
          {partNames.length ? (
            <div className="mt-[0.45in] border-t border-[#2f413f] pt-[0.2in]">
              <p className="font-mono text-[8pt] uppercase tracking-[0.22em] text-[#5eead4]">Inside</p>
              <ol className="mt-[0.12in] grid grid-cols-2 gap-x-[0.3in] gap-y-[0.06in] text-[10.5pt] text-[#e9fbf7]">
                {partNames.map((name, i) => (
                  <li key={name}>
                    <span className="mr-[0.08in] font-mono text-[8.5pt] text-[#4dc1af]">{i + 1}</span>
                    {name}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <div className="mt-auto text-[9.5pt] leading-[1.5] text-[#a7d9d0]">
            <p className="font-heading text-[11pt] font-bold text-[#e9fbf7]">{book.author}</p>
            <p>
              Free to read at {site.domain}/books/{book.slug}
            </p>
            <p>Prove every claim: {site.domain}/books/{book.slug}/lab</p>
          </div>
        </section>
        {/* Barcode area: kept clear; KDP prints the barcode here. */}
        <div
          aria-hidden
          className="absolute bg-white"
          style={{
            width: "2in",
            height: "1.2in",
            left: inch(edge + trimW - 0.25 - 2),
            top: inch(edge + trimH - 0.25 - 1.2),
          }}
        />

        {/* Spine */}
        <section
          className="absolute flex items-center justify-center bg-[#07161a]"
          style={{ left: inch(edge + trimW + hinge), top: 0, width: inch(spine), height: inch(height) }}
        >
          {spineText ? (
            <div
              className="flex items-center gap-[0.35in] whitespace-nowrap"
              style={{ transform: "rotate(90deg)", maxWidth: inch(trimH - 2 * safe - 0.5) }}
            >
              <span className="font-heading font-extrabold tracking-[-0.01em]" style={{ fontSize: `${Math.min(spine * 0.55, 0.42)}in` }}>
                {book.title}
              </span>
              <span className="font-heading font-bold text-[#a7d9d0]" style={{ fontSize: `${Math.min(spine * 0.3, 0.2)}in` }}>
                {book.author}
              </span>
              {book.publisher ? (
                <span className="font-mono uppercase tracking-[0.2em] text-[#5eead4]" style={{ fontSize: `${Math.min(spine * 0.18, 0.12)}in` }}>
                  {book.publisher}
                </span>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Front cover */}
        <section
          className="absolute"
          style={{ left: inch(edge + trimW + hinge * 2 + spine), top: inch(edge), ...panel }}
        >
          <BookCover
            book={book}
            print
            size="lg"
            kicker="PostgreSQL 18"
          />
        </section>
      </div>
    </>
  );
}
