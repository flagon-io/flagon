#!/usr/bin/env node
/**
 * Lint the books before they ship. For every chapter:
 *
 *   - links to /books/<book>/<chapter>#anchor resolve to a real chapter and a
 *     real heading (ids computed the way rehype-slug does, with github-slugger)
 *   - in-page #anchor links resolve
 *   - every fenced code block names its language
 *   - no em or en dashes (house style)
 *   - no raw < or { in prose, which MDX would try to parse as JSX
 *
 *   npm run book:check                 every book
 *   npm run book:check -- <book>       one book
 *
 * Exits non-zero when anything fails, so it can gate CI.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { compile } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { slug as slugify } from "github-slugger";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const booksDir = path.join(root, "content", "books");
const requested = process.argv.slice(2);

/**
 * Compile a chapter the way the site does (remark-gfm, rehype-slug) and return
 * its heading ids, so anchors are checked against what readers actually get.
 * Throws on anything MDX can't compile, which would break the site build.
 */
async function headingIds(source) {
  const ids = new Set();
  const collect = () => (tree) => {
    const walk = (node) => {
      if (node.type === "element" && /^h[1-6]$/.test(node.tagName) && node.properties?.id) {
        ids.add(String(node.properties.id));
      }
      // <DeepDive title="..."> blocks are linkable by their slugged title.
      if (node.type === "mdxJsxFlowElement" && node.name === "DeepDive") {
        const title = node.attributes?.find((a) => a.name === "title")?.value;
        if (typeof title === "string") ids.add(slugify(title));
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
  };
  await compile(source, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug, collect] });
  return ids;
}

/** Split a chapter into lines tagged with whether they sit inside a fence. */
function scan(body) {
  let fence = null;
  return body.split(/\r?\n/).map((line, i) => {
    const m = /^\s*(```+|~~~+)(.*)$/.exec(line);
    if (m) {
      if (!fence) {
        fence = m[1];
        return { line, n: i + 1, kind: "open", lang: m[2].trim() };
      }
      if (line.trim().startsWith(fence)) {
        fence = null;
        return { line, n: i + 1, kind: "close" };
      }
    }
    return { line, n: i + 1, kind: fence ? "code" : "prose" };
  });
}

/**
 * The claims a lab checks: the first argument of every lab.prove('...') in
 * SQL, and of every prove '...' / prove "..." in a shell lab. Same rules as
 * the print edition, which prints these labels in place of the box.
 */
function proveClaims(code) {
  const claims = [];
  for (const m of code.matchAll(/\bprove\s*\(\s*'((?:[^']|'')*)'/g)) claims.push(m[1].replace(/''/g, "'"));
  for (const m of code.matchAll(/(?:^|\n)\s*prove\s+(?:'([^']*)'|"((?:[^"\\]|\\.)*)")/g)) {
    claims.push((m[1] ?? m[2]).replace(/\\(.)/g, "$1"));
  }
  return claims.map((c) => c.trim()).filter(Boolean);
}

/** A code line compared by content: trimmed, with runs of whitespace as one space. */
const normalizeLine = (line) => line.trim().replace(/\s+/g, " ");

/**
 * Prove it boxes against the lab kit. A box is the reader's receipt for a
 * claim, so it must name a real lab script, show at least one check, and
 * quote each check exactly as the script runs it; a label edited in one place
 * and not the other is a receipt for a different claim. Every code line in a
 * box must be a line of the lab too (blank, comment and "..." lines aside),
 * or for a shell lab a piece of one, so a box can show less than the lab but
 * never something it doesn't run. Each lab script must belong to a chapter
 * and name it in its header.
 */
function checkLabs(book, dir, labDir, parsed) {
  const labFiles = new Map();
  for (const f of fs.readdirSync(labDir).filter((f) => /^\d+-.+\.(sql|sh)$/.test(f))) {
    labFiles.set(f, fs.readFileSync(path.join(labDir, f), "utf8"));
  }
  const used = new Set();
  const labLines = new Map();
  const titles = new Map();
  for (const { file, slug } of parsed) {
    titles.set(slug, String(matter(fs.readFileSync(path.join(dir, file), "utf8")).data.title ?? ""));
  }
  for (const { file } of parsed) {
    const where = `content/books/${book}/${file}`;
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    for (const m of raw.matchAll(/<ProveIt\b([^>]*)>([\s\S]*?)<\/ProveIt>/g)) {
      const n = raw.slice(0, m.index).split("\n").length;
      const lab = /\blab="([^"]+)"/.exec(m[1])?.[1];
      if (!lab) {
        fail(where, n, "ProveIt without lab=\"...\"");
        continue;
      }
      const labFile = lab.endsWith(".sh") ? lab : `${lab}.sql`;
      const script = labFiles.get(labFile);
      if (!script) {
        fail(where, n, `ProveIt names lab ${labFile}, which doesn't exist`);
        continue;
      }
      used.add(labFile);
      const claims = proveClaims(m[2]);
      if (!claims.length) fail(where, n, "ProveIt shows no prove(...) check");
      const known = new Set(proveClaims(script));
      for (const c of claims) {
        if (!known.has(c)) fail(where, n, `ProveIt check not in ${labFile} verbatim: "${c.slice(0, 80)}"`);
      }
      // Every code line the box shows must be a line the lab runs. A box may
      // show a subset of the lab, and mark a skipped stretch with "...".
      // Shell labs wrap their SQL and commands in plumbing (`sql book -c
      // "..."`, `docker compose exec ... pgbench ...`) and a box shows the
      // inner part, so there a box line may also sit inside a script line.
      const shell = labFile.endsWith(".sh");
      if (!labLines.has(labFile)) {
        const all = script.split(/\r?\n/).map(normalizeLine);
        labLines.set(labFile, { set: new Set(all), all });
      }
      const lines = labLines.get(labFile);
      for (const row of scan(m[2])) {
        if (row.kind !== "code") continue;
        const line = normalizeLine(row.line);
        if (!line || /^(--|#)/.test(line) || /^(\.\.\.|…)$/.test(line)) continue;
        if (lines.set.has(line)) continue;
        if (shell && lines.all.some((l) => l.includes(line))) continue;
        fail(where, n + row.n - 1, `ProveIt line not in ${labFile}: "${line.slice(0, 80)}"`);
      }
    }
  }
  for (const [f, script] of labFiles) {
    const where = `content/books/${book}/lab/${f}`;
    const slug = f.replace(/^\d+-/, "").replace(/\.(sql|sh)$/, "");
    if (!titles.has(slug)) {
      fail(where, 1, `no chapter "${slug}" for this lab`);
      continue;
    }
    // The header names the chapter by its current title and links to it. SQL
    // labs share one fixed header: the title, the link, and how to run it.
    if (f.endsWith(".sql")) {
      const got = script.split(/\r?\n/);
      [
        `-- Lab for "${titles.get(slug)}"`,
        `-- https://www.flagon.io/books/${book}/${slug}`,
        `-- Run: ./lab ${f.replace(/\.sql$/, "")}`,
      ].forEach((want, i) => {
        if (got[i] !== want) fail(where, i + 1, `header line ${i + 1} should be: ${want}`);
      });
    }
    const head = script.split("\n").slice(0, 4).join("\n");
    if (!head.includes(titles.get(slug))) fail(where, 1, `header doesn't name the chapter "${titles.get(slug)}"`);
    if (!head.includes(`/books/${book}/${slug}`)) fail(where, 2, `header doesn't link /books/${book}/${slug}`);
    if (!used.has(f)) fail(where, 1, "no Prove it box in the chapter quotes this lab");
  }
}

let failures = 0;
const fail = (file, n, msg) => {
  failures++;
  console.log(`${file}:${n}  ${msg}`);
};

const books = fs
  .readdirSync(booksDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((b) => requested.length === 0 || requested.includes(b));

for (const book of books) {
  const dir = path.join(booksDir, book);
  // Same reading order as src/lib/books.ts: `chapters:` in index.mdx, then file names.
  const index = matter(fs.readFileSync(path.join(dir, "index.mdx"), "utf8")).data;
  const order = Array.isArray(index.chapters) ? index.chapters.map(String) : [];
  const rank = (f) => {
    const at = order.indexOf(f.replace(/^\d+-/, "").replace(/\.mdx$/, ""));
    return at < 0 ? order.length : at;
  };
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d+-.+\.mdx$/.test(f))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  for (const slug of order) {
    if (!files.some((f) => f.replace(/^\d+-/, "").replace(/\.mdx$/, "") === slug)) {
      console.log(`content/books/${book}/index.mdx:1  chapters lists "${slug}" but there's no such file yet`);
    }
  }

  // Pass 1: every chapter's heading ids, and what each says it builds on.
  const anchors = new Map();
  const buildsOn = new Map();
  const parsed = [];
  for (const file of files) {
    const slug = file.replace(/^\d+-/, "").replace(/\.mdx$/, "");
    let content = "";
    let offset = 0;
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const parsed = matter(raw);
      content = parsed.content;
      // Report file line numbers, not body ones: count what the frontmatter took.
      offset = raw.split(/\r?\n/).length - content.split(/\r?\n/).length;
      if (parsed.data.builds_on !== undefined && !Array.isArray(parsed.data.builds_on)) {
        fail(`content/books/${book}/${file}`, 1, "builds_on must be a list of chapter slugs");
      }
      buildsOn.set(slug, Array.isArray(parsed.data.builds_on) ? parsed.data.builds_on.map(String) : []);
      for (const key of ["title", "description", "part"]) {
        if (!parsed.data[key]) fail(`content/books/${book}/${file}`, 1, `frontmatter is missing ${key}`);
      }
    } catch (e) {
      fail(`content/books/${book}/${file}`, 1, `frontmatter does not parse (quote values containing ": "): ${e.reason ?? e.message}`);
    }
    const lines = scan(content).map((l) => ({ ...l, n: l.n + offset }));
    let ids = new Set();
    try {
      ids = await headingIds(content);
    } catch (e) {
      const at = e.place?.start?.line ?? e.line ?? e.place?.line;
      fail(`content/books/${book}/${file}`, at ? at + offset : 1, `MDX does not compile: ${e.reason ?? e.message}`);
    }
    anchors.set(slug, ids);
    parsed.push({ file, slug, lines });
  }

  // A part's chapters must sit together in reading order; a part that comes
  // back after another one means a stale `part:` in some chapter's frontmatter.
  {
    const seen = new Set();
    let current = null;
    for (const file of files) {
      const { data } = matter(fs.readFileSync(path.join(dir, file), "utf8"));
      const part = String(data.part ?? "");
      if (part === current) continue;
      if (seen.has(part)) fail(`content/books/${book}/${file}`, 1, `part "${part}" resumes after "${current}"; check this chapter's part:`);
      seen.add(part);
      current = part;
    }
  }

  // builds_on must name earlier chapters: a prerequisite you haven't reached
  // yet isn't one.
  const reading = parsed.map((p) => p.slug);
  for (const [slug, deps] of buildsOn) {
    for (const dep of deps) {
      const at = reading.indexOf(dep);
      if (at < 0) fail(`content/books/${book}`, 0, `${slug}: builds_on names unknown chapter "${dep}"`);
      else if (at >= reading.indexOf(slug)) fail(`content/books/${book}`, 0, `${slug}: builds_on "${dep}" comes later in the book`);
    }
  }

  // Pass 2: check each chapter.
  for (const { file, slug, lines } of parsed) {
    const where = `content/books/${book}/${file}`;
    for (const l of lines) {
      if (/[–—]/.test(l.line)) fail(where, l.n, "em or en dash");
      // Output a writer couldn't capture yet is marked, never invented; it
      // must be filled in from a real run before the book ships.
      if (/(OUTPUT|PLAN) PENDING/.test(l.line)) fail(where, l.n, "placeholder output still pending a real run");
      if (l.kind === "open" && !l.lang) fail(where, l.n, "code fence without a language");
      if (l.kind !== "prose") continue;

      // Inline code can hold anything; strip it before looking at prose.
      const prose = l.line.replace(/`[^`]*`/g, "``");
      const jsxish = /^\s*<\/?(Callout|Steps|Step|Tabs|Tab|Cards|Card)\b/.test(prose);
      if (!jsxish && (/<(?![A-Za-z/!])/.test(prose) || /[{}]/.test(prose))) {
        fail(where, l.n, "raw < { or } in prose (MDX will choke); use inline code");
      }

      for (const m of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
        const href = m[1];
        if (href.startsWith("#")) {
          if (!anchors.get(slug).has(href.slice(1))) fail(where, l.n, `no heading for ${href}`);
          continue;
        }
        const prefix = `/books/${book}/`;
        if (!href.startsWith(prefix)) continue;
        const [target, hash] = href.slice(prefix.length).split("#");
        // The lab page and its files live beside the chapters, not in them.
        if (target === "lab" || target.startsWith("lab/")) continue;
        if (!anchors.has(target)) fail(where, l.n, `no chapter "${target}" (${href})`);
        else if (hash && !anchors.get(target).has(hash)) fail(where, l.n, `no heading #${hash} in ${target}`);
      }
    }
  }
  // Labs written while the lab kit was unavailable say so; they must be run.
  const labDir = path.join(dir, "lab");
  if (fs.existsSync(labDir)) checkLabs(book, dir, labDir, parsed);
  if (fs.existsSync(labDir)) {
    for (const f of fs.readdirSync(labDir).filter((f) => /\.(sql|sh)$/.test(f))) {
      if (/STATUS: not yet run/.test(fs.readFileSync(path.join(labDir, f), "utf8"))) {
        fail(`content/books/${book}/lab/${f}`, 1, "lab has not been run on the lab kit yet");
      }
    }
  }
  console.log(`${book}: ${files.length} chapters checked`);
}

if (failures) {
  console.log(`\n${failures} problem${failures === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log("All clear.");
