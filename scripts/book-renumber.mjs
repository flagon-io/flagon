#!/usr/bin/env node
/**
 * Renumber a book's files to match its reading order (`chapters:` in
 * index.mdx), so file names read in the same order as the book. Reading order
 * never depends on file names; this only keeps the folder tidy.
 *
 *   npm run book:renumber -- eight-kilobytes            show what would change
 *   npm run book:renumber -- eight-kilobytes --write    do it
 *
 * Renames NN-slug.mdx and the chapter's lab files (lab/NN-slug.sql, .sh,
 * .compose.yml) together, and rewrites every reference to an old lab name:
 * <ProveIt lab="..."> attributes and lab names mentioned in chapters and lab
 * scripts. Slugs, and so URLs, never change. Front matter is numbered 00,
 * back matter continues the sequence.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [book, ...flags] = process.argv.slice(2);
const write = flags.includes("--write");
if (!book) {
  console.error("usage: npm run book:renumber -- <book> [--write]");
  process.exit(2);
}

const dir = path.join(root, "content", "books", book);
const labDir = path.join(dir, "lab");
const order = matter(fs.readFileSync(path.join(dir, "index.mdx"), "utf8")).data.chapters;
if (!Array.isArray(order)) {
  console.error("index.mdx has no chapters: list; nothing to renumber by.");
  process.exit(1);
}

const files = fs.readdirSync(dir).filter((f) => /^\d+-.+\.mdx$/.test(f));
const bySlug = new Map(files.map((f) => [f.replace(/^\d+-/, "").replace(/\.mdx$/, ""), f]));
const missing = order.filter((s) => !bySlug.has(s));
const unlisted = [...bySlug.keys()].filter((s) => !order.includes(s));
if (missing.length || unlisted.length) {
  if (missing.length) console.error(`listed but missing: ${missing.join(", ")}`);
  if (unlisted.length) console.error(`files not in chapters: ${unlisted.join(", ")}`);
  process.exit(1);
}

// Old base name (NN-slug) to new, in reading order.
const width = String(order.length - 1).length < 2 ? 2 : String(order.length - 1).length;
const renames = order
  .map((slug, i) => ({
    from: bySlug.get(slug).replace(/\.mdx$/, ""),
    to: `${String(i).padStart(width, "0")}-${slug}`,
  }))
  .filter((r) => r.from !== r.to);

if (renames.length === 0) {
  console.log("Already in order.");
  process.exit(0);
}

const labFiles = fs.existsSync(labDir) ? fs.readdirSync(labDir) : [];
const moves = [];
for (const { from, to } of renames) {
  moves.push([path.join(dir, `${from}.mdx`), path.join(dir, `${to}.mdx`)]);
  for (const f of labFiles) {
    if (f === `${from}.sql` || f === `${from}.sh` || f === `${from}.compose.yml`) {
      moves.push([path.join(labDir, f), path.join(labDir, f.replace(from, to))]);
    }
  }
}

// References to old lab names, longest first so 15-plans never matches inside
// something longer. Word boundaries keep "5-wal" from matching "05-wal".
const patterns = renames
  .sort((a, b) => b.from.length - a.from.length)
  .map(({ from, to }) => [new RegExp(`(?<![\\w-])${from}(?![\\w-])`, "g"), to]);

// Rewrite contents first (in temp-free two passes), then move files, so a
// rename chain like 03 -> 04 -> 05 can't collide: every move goes via a
// temporary name.
const textFiles = [
  ...files.map((f) => path.join(dir, f)),
  ...labFiles
    .filter((f) => /\.(sql|sh|yml|md)$/.test(f) || f === "lab")
    .map((f) => path.join(labDir, f)),
];
let edits = 0;
for (const file of textFiles) {
  const before = fs.readFileSync(file, "utf8");
  let after = before;
  for (const [re, to] of patterns) after = after.replace(re, to);
  if (after !== before) {
    edits++;
    console.log(`edit   ${path.relative(root, file)}`);
    if (write) fs.writeFileSync(file, after);
  }
}
for (const [from, to] of moves) {
  console.log(`rename ${path.relative(root, from)} -> ${path.basename(to)}`);
}
if (write) {
  const temps = moves.map(([from, to]) => {
    const tmp = `${from}.renumber-tmp`;
    fs.renameSync(from, tmp);
    return [tmp, to];
  });
  for (const [tmp, to] of temps) fs.renameSync(tmp, to);
}
console.log(`\n${moves.length} renames, ${edits} files with updated references${write ? "" : " (dry run; pass --write)"}`);
