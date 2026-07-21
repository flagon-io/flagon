import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Catches words fused onto the end of an inline element: "personal access
 * tokenworks here too."
 *
 * The source for that read `</strong> works`, with the space right there, and
 * still rendered without it. JSX is supposed to keep a space that sits between
 * an element and text on the same line, but SWC drops it in some cases and not
 * others - two sites in this codebase with the identical shape compiled
 * differently. So the source cannot be trusted to tell you what shipped, and
 * grepping .tsx for the risky shape flags 36 places when only 2 are actually
 * broken.
 *
 * The rendered HTML is the only ground truth, and the marketing pages are
 * prerendered at build time, so it is sitting on disk after `npm run build`.
 * When an element and the following word must not run together, write an
 * explicit {" "} and the compiler has no discretion to take away.
 */
const PRERENDERED = join(process.cwd(), ".next", "server", "app");

/** Inline elements: text flows through these, so a missing space shows. */
const INLINE = ["strong", "em", "b", "i", "code", "abbr"];

function htmlFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...htmlFiles(path));
    else if (entry.name.endsWith(".html")) found.push(path);
  }
  return found;
}

describe("rendered spacing", () => {
  it.skipIf(!existsSync(PRERENDERED))(
    "never fuses a word onto the end of an inline element",
    () => {
      // <span> is excluded deliberately. It is the codebase's utility wrapper
      // (`className={code}`, decorative aria-hidden rules, `class="block"`
      // labels), and those legitimately butt against the next character. The
      // elements above are only ever used to mark up running prose.
      const pattern = new RegExp(`</(?:${INLINE.join("|")})>(?=[A-Za-z])`, "g");
      const offences: string[] = [];

      for (const file of htmlFiles(PRERENDERED)) {
        const html = readFileSync(file, "utf8");
        for (const match of html.matchAll(pattern)) {
          const context = html
            .slice(Math.max(0, match.index - 70), match.index + 25)
            .replace(/\s+/g, " ");
          offences.push(`${file.replace(process.cwd(), "")}: ...${context}`);
        }
      }

      expect(
        offences,
        `Missing space after an inline element. Use an explicit {" "}:\n${offences.join("\n")}`,
      ).toEqual([]);
    },
  );

  /**
   * The same bug, one shape further out: an INTERPOLATION fused to the prose
   * after it, as in "Flagon, Inc.is a very small company". The source had the
   * space, on the same line, and the compiler took it anyway.
   *
   * React marks the boundary between two adjacent text nodes with an empty
   * comment, which is exactly where an interpolated value meets the text
   * around it. So a letter on BOTH sides of that marker, with no whitespace on
   * either, means a space that existed in the source is not in the output.
   * That needs no dictionary of brand strings and no guess about which
   * interpolations are prose - the marker only appears where two text nodes
   * met, and prose either side of it should never collide.
   */
  it.skipIf(!existsSync(PRERENDERED))(
    "never fuses an interpolated value onto the text beside it",
    () => {
      // A WORD on the left (optionally ending in a sentence's full stop) and a
      // word on the right. `$<!-- -->20`, `6<!-- -->.`, and
      // `security@<!-- -->flagon.io` are correct and deliberate: a value
      // butting against punctuation or a symbol is normal.
      //
      // The full stop has to be preceded by a letter, which is what separates
      // "Inc.<!-- -->is" (a fused sentence) from "*.<!-- -->flagon.io" (a
      // wildcard domain that is supposed to read as one token).
      const pattern = /(?:[A-Za-z]|[A-Za-z]\.)<!-- -->[A-Za-z]/g;
      const offences: string[] = [];

      for (const file of htmlFiles(PRERENDERED)) {
        const html = readFileSync(file, "utf8");
        for (const match of html.matchAll(pattern)) {
          const context = html
            .slice(Math.max(0, match.index - 60), match.index + 40)
            .replace(/\s+/g, " ");
          offences.push(`${file.replace(process.cwd(), "")}: ...${context}`);
        }
      }

      expect(
        offences,
        `An interpolated value ran into the next word. Use an explicit {" "}:\n${offences.join("\n")}`,
      ).toEqual([]);
    },
  );
});
