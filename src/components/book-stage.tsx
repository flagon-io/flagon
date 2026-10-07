import { SlantBox } from "@/components/slant";
import { BookCover } from "@/components/book-cover";
import { DOTS } from "@/components/schematic";
import { runForAspect } from "@/lib/slant";

type StageBook = Parameters<typeof BookCover>[0]["book"];

/**
 * A book standing on a panel that leans at the site's tilt, like the art
 * cards. The cover itself stays upright: a book is a physical thing, the stage
 * is the site's. Lifts a little when its link is hovered.
 */
export function BookStage({
  book,
  aspect = 4 / 3,
  className,
}: {
  book: StageBook;
  /** Width over height of the stage; the lean is worked out from it. */
  aspect?: number;
  className?: string;
}) {
  const run = runForAspect(aspect);
  return (
    <SlantBox
      run={run}
      className={className}
      style={{ aspectRatio: aspect }}
      frameClassName="rounded-sm border border-hairline bg-(--art-card)"
    >
      <div
        className="relative flex h-full items-center justify-center"
        style={{ ...DOTS, paddingInline: run }}
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(50%_55%_at_50%_55%,color-mix(in_oklab,var(--brand)_18%,transparent),transparent)]"
        />
        <Book3D book={book} className="relative h-[80%]" />
      </div>
    </SlantBox>
  );
}

/**
 * The cover as a physical book: leaning back a little and turned so its spine
 * shows, drifting on a slow float, and rising to face you when its link is
 * hovered (globals.css has the poses). The thickness is a share of the cover's
 * width, not the real spine's, so the book reads as a book at any size.
 */
function Book3D({ book, className }: { book: StageBook; className?: string }) {
  // Spine depth as a share of the cover's width; the cover is 2:3, so the same
  // depth is two thirds of that share of its height.
  const depth = 13;
  return (
    <div
      className={["book-stage-book", className].filter(Boolean).join(" ")}
      style={{ perspective: "1400px" }}
      aria-hidden
    >
      <div className="relative h-full" style={{ aspectRatio: "2 / 3" }}>
        {/* The shadow the book casts on the stage; it tightens as the book rises. */}
        <div className="book-shadow absolute inset-x-[4%] -bottom-[4%] h-[10%] rounded-[50%] bg-black/60 blur-2xl" />
        <div className="book-float relative h-full w-full">
          <div
            className="book-3d relative h-full w-full"
            style={{ transformStyle: "preserve-3d" }}
          >
            {/* Spine, folded back from the left edge. */}
            <div
              className="absolute inset-y-0 right-full flex items-center justify-center bg-[#07161a] @container"
              style={{
                width: `${depth}%`,
                transformOrigin: "right center",
                transform: "rotateY(-90deg)",
              }}
            >
              <span className="whitespace-nowrap font-heading text-[42cqw] font-extrabold text-[#e9fbf7] [writing-mode:vertical-rl]">
                {book.title}
              </span>
            </div>
            {/* The page block: top and bottom edges, and the fore-edge. Stripes
              run along each edge, the way stacked sheets do. */}
            <div
              className="absolute inset-x-0 bottom-full bg-[repeating-linear-gradient(0deg,#ece8de_0_1px,#d3cec1_1px_2px)]"
              style={{
                height: `${(depth * 2) / 3}%`,
                transformOrigin: "center bottom",
                transform: "rotateX(90deg)",
              }}
            />
            <div
              className="absolute inset-x-0 top-full bg-[repeating-linear-gradient(0deg,#e2ddd1_0_1px,#c9c3b5_1px_2px)]"
              style={{
                height: `${(depth * 2) / 3}%`,
                transformOrigin: "center top",
                transform: "rotateX(-90deg)",
              }}
            />
            <div
              className="absolute inset-y-0 left-full bg-[repeating-linear-gradient(90deg,#ece8de_0_1px,#d3cec1_1px_2px)]"
              style={{
                width: `${depth}%`,
                transformOrigin: "left center",
                transform: "rotateY(90deg)",
              }}
            />
            <BookCover book={book} className="absolute inset-0 h-full w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
