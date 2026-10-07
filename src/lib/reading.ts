import readingTime from "reading-time";

/**
 * Minutes to read an MDX body, counting prose only. Code isn't read at prose
 * speed (it's skimmed, copied, or run), so fenced code blocks and Prove it
 * boxes (which are all code) don't count, and neither do the JSX tags around
 * callouts and deep dives; the prose inside those still does.
 */
export function readingMinutes(mdx: string): number {
  const prose = mdx
    .replace(/^\s*(```|~~~)[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, "")
    .replace(/<ProveIt\b[\s\S]*?<\/ProveIt>/g, "")
    .replace(/<\/?[A-Z][^>]*>/g, "");
  return Math.max(1, Math.round(readingTime(prose).minutes));
}
