import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import GithubSlugger, { slug } from "github-slugger";
import { stripMarkdown } from "@/lib/toc";
import type { Book, Chapter } from "@/lib/books";

/**
 * The print edition's back-of-book index. On paper there's no search box, so
 * the paperback ends with an index the way any technical book does.
 *
 * Terms come from two places: every glossary headword (so the index and the
 * glossary never drift apart), plus the extra terms and match rules in
 * content/books/<book>/index-terms.md. A term points at the sections that
 * discuss it: a section whose heading names the term, or whose prose (code
 * blocks and Prove it boxes don't print as prose, so they don't count) uses it
 * at least twice. Locators are section ids, the same ids the print script
 * reads page numbers back for, so the index prints real page numbers.
 *
 * Front matter is left out: its pages are numbered in roman in a separate
 * pass the body never sees. Back matter is left out because the glossary and
 * checklists would match every term.
 */

export type IndexLocator = {
  /** Print id of the section: `<chapter>--<heading id>`, or `ch-<chapter>`. */
  id: string;
  /** The section the glossary points at for this term: printed in bold. */
  primary: boolean;
};

export type IndexEntry = {
  term: string;
  /** Render the term as code (it was a `code` headword). */
  code: boolean;
  locators: IndexLocator[];
  /** "see X": a cross-reference instead of (or as well as) locators. */
  see?: string;
};

type TermConfig = {
  term: string;
  /** Print the term as code (settings, functions, identifiers). */
  code?: boolean;
  /** Phrases that count as a mention; defaults to the term itself. */
  match?: string[];
  see?: string;
};

type Config = {
  /** Extra terms the glossary doesn't define. */
  terms?: TermConfig[];
  /** Match phrases for glossary headwords, keyed by headword. */
  match?: Record<string, string[]>;
  /** Glossary headwords to leave out of the index. */
  skip?: string[];
  /** Pure cross-references: "Write-ahead log": "WAL". */
  see?: Record<string, string>;
};

const MAX_LOCATORS = 6;
const INDEXED_PARTS_EXCLUDED = new Set(["Front matter", "Back matter"]);

type Section = { id: string; heading: string; text: string };

/** Split a chapter into printable sections: opener, headings, deep dives. */
function sections(chapter: Chapter): Section[] {
  const out: Section[] = [];
  const slugger = new GithubSlugger();
  let current: Section = { id: `ch-${chapter.slug}`, heading: chapter.title, text: "" };
  out.push(current);
  // The section to return to when a deep dive closes.
  let outer: Section = current;
  let inFence = false;
  let inProve = false;
  let inDeep = false;

  for (const line of chapter.content.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^\s*<ProveIt[ >]/.test(line)) inProve = true;
    if (inProve) {
      if (/<\/ProveIt>/.test(line)) inProve = false;
      continue;
    }
    const deep = /^\s*<DeepDive\s+title="([^"]+)"/.exec(line);
    if (deep) {
      current = { id: `${chapter.slug}--${slug(deep[1])}`, heading: deep[1], text: "" };
      out.push(current);
      inDeep = true;
      continue;
    }
    if (/^\s*<\/DeepDive>/.test(line)) {
      inDeep = false;
      current = outer;
      continue;
    }
    const h = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      const text = stripMarkdown(h[2]);
      current = { id: `${chapter.slug}--${slugger.slug(text)}`, heading: text, text: "" };
      out.push(current);
      if (!inDeep) outer = current;
      continue;
    }
    current.text += " " + line;
  }
  for (const s of out) s.text = prose(s.text);
  return out;
}

/** Visible prose only: link targets, JSX tags and markdown marks removed. */
function prose(s: string): string {
  return s
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*[\]]/g, " ")
    .replace(/\s+/g, " ");
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive, with a plural allowed. */
function matcher(phrases: string[]): RegExp {
  const alts = phrases.map((p) => escape(p.trim())).sort((a, b) => b.length - a.length);
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alts.join("|")})(?:e?s)?(?![\\p{L}\\p{N}_])`, "giu");
}

/** Glossary headwords, whether each was code, and where each one points. */
function glossaryTerms(book: Book): { term: string; code: boolean; primary: string | null }[] {
  const glossary = book.chapters.find((c) => c.slug === "glossary");
  if (!glossary) return [];
  const terms: { term: string; code: boolean; primary: string | null }[] = [];
  const bookPath = `/books/${book.slug}/`;
  let last: (typeof terms)[number] | null = null;
  for (const line of glossary.content.split("\n")) {
    const h = /^###\s+(.+?)\s*$/.exec(line);
    if (h) {
      last = { term: stripMarkdown(h[1]), code: /^`[^`]+`$/.test(h[1].trim()), primary: null };
      terms.push(last);
      continue;
    }
    if (last && !last.primary) {
      const see = new RegExp(`\\]\\(${escape(bookPath)}([a-z0-9-]+)(?:#([^)]+))?\\)`).exec(line);
      if (see) last.primary = see[2] ? `${see[1]}--${see[2]}` : `ch-${see[1]}`;
    }
  }
  return terms;
}

function readConfig(book: Book): Config {
  const file = path.join(process.cwd(), "content", "books", book.slug, "index-terms.md");
  if (!fs.existsSync(file)) return {};
  return matter(fs.readFileSync(file, "utf8")).data as Config;
}

/** Letter-by-letter, ignoring case and punctuation, like the glossary. */
export const indexSortKey = (term: string) => term.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function buildIndex(book: Book): IndexEntry[] {
  const config = readConfig(book);
  const skip = new Set((config.skip ?? []).map((s) => s.toLowerCase()));
  const all = book.chapters
    .filter((c) => !INDEXED_PARTS_EXCLUDED.has(c.part))
    .flatMap((c) => sections(c));

  const wanted: { term: string; code: boolean; primary: string | null; match: string[]; see?: string }[] = [];
  for (const g of glossaryTerms(book)) {
    if (skip.has(g.term.toLowerCase())) continue;
    const bare = g.term.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    wanted.push({ ...g, match: config.match?.[g.term] ?? [bare] });
  }
  const known = new Set(wanted.map((w) => w.term.toLowerCase()));
  for (const t of config.terms ?? []) {
    if (known.has(t.term.toLowerCase())) continue;
    wanted.push({ term: t.term, code: t.code ?? /_/.test(t.term), primary: null, match: t.match ?? [t.term], see: t.see });
  }

  const entries: IndexEntry[] = [];
  for (const w of wanted) {
    const re = matcher(w.match);
    const scored: { id: string; score: number }[] = [];
    for (const s of all) {
      const inHeading = re.test(s.heading);
      re.lastIndex = 0;
      const count = s.text.match(re)?.length ?? 0;
      if (inHeading || count >= 2) scored.push({ id: s.id, score: count + (inHeading ? 5 : 0) });
    }
    scored.sort((a, b) => b.score - a.score);
    const picked = new Set(scored.slice(0, MAX_LOCATORS).map((s) => s.id));
    if (w.primary) picked.add(w.primary);
    const locators = [...picked].map((id) => ({ id, primary: id === w.primary }));
    if (locators.length || w.see) entries.push({ term: w.term, code: w.code, locators, see: w.see });
  }
  for (const [term, target] of Object.entries(config.see ?? {})) {
    entries.push({ term, code: false, locators: [], see: target });
  }
  return entries.sort((a, b) => indexSortKey(a.term).localeCompare(indexSortKey(b.term)));
}
