import GithubSlugger from "github-slugger";

export type TocItem = {
  depth: 2 | 3;
  text: string;
  id: string;
  /** Inside a <DeepDive> block: hidden from the rail in simple reading mode. */
  deep?: boolean;
};

/** Strip the markdown we allow in headings down to visible text. */
export function stripMarkdown(input: string): string {
  // Code spans are literal: keep their text out of the emphasis rules below.
  const parts = input.split(/(`[^`]+`)/g);
  return parts
    .map((part) =>
      part.startsWith("`") && part.endsWith("`")
        ? part.slice(1, -1)
        : part
            .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links
            .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1") // *emphasis*
            // _emphasis_ only at word edges: pg_stat_io is plain text.
            .replace(/(^|[^\p{L}\p{N}_])_{1,3}([^_]+)_{1,3}(?=$|[^\p{L}\p{N}_])/gu, "$1$2"),
    )
    .join("")
    .replace(/&rsquo;|&#8217;/g, "’")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Pull the H2/H3 headings out of a raw MDX string, with ids that match the ones
 * rehype-slug assigns at render time (both use github-slugger over the visible
 * heading text, in document order, so duplicates dedupe identically). Fenced
 * code blocks are skipped so a `## ` inside a code sample isn't treated as a
 * heading.
 */
export function extractToc(mdx: string): TocItem[] {
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];
  let inFence = false;
  let inDeep = 0;

  for (const line of mdx.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^\s*<DeepDive[ >]/.test(line)) inDeep++;
    if (/^\s*<\/DeepDive>/.test(line)) inDeep = Math.max(0, inDeep - 1);

    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const depth = match[1].length === 2 ? 2 : 3;
    const text = stripMarkdown(match[2]);
    items.push({ depth, text, id: slugger.slug(text), ...(inDeep > 0 ? { deep: true } : {}) });
  }

  return items;
}
